#!/usr/bin/env python3
"""Assemble exact slide renders and reviewed per-scene narration into a video.

Input manifest: {"scenes": [{"id", "slide_path", "audio_path" (optional),
"pause_after_seconds" (optional), "duration_seconds" (for silent cards)}],
"music_path": optional path}. All paths are resolved relative to the manifest.
Uses ffmpeg and ffprobe; does not generate or rewrite lesson content.
"""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path


def run(args):
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL)


def duration(path):
    return float(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
    ], text=True).strip())


def esc(path):
    return str(path).replace("'", "'\\''")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('manifest')
    ap.add_argument('--output', required=True)
    ap.add_argument('--work-dir', required=True)
    ap.add_argument('--audio-only', action='store_true')
    args = ap.parse_args()
    manifest_path = Path(args.manifest).resolve()
    data = json.loads(manifest_path.read_text())
    base = manifest_path.parent
    work = Path(args.work_dir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    audio_parts, timeline = [], []
    image_lines = ['ffconcat version 1.0']
    elapsed = 0.0
    for index, scene in enumerate(data['scenes'], 1):
        slide = (base / scene['slide_path']).resolve()
        if not slide.is_file():
            raise FileNotFoundError(slide)
        audio = (base / scene['audio_path']).resolve() if scene.get('audio_path') else None
        if audio and not audio.is_file():
            raise FileNotFoundError(audio)
        speech_duration = duration(audio) if audio else 0.0
        total_duration = speech_duration + float(scene.get('pause_after_seconds', 0)) if audio else float(scene['duration_seconds'])
        if total_duration <= 0:
            raise ValueError('A scene must have positive duration')
        prepared_audio = work / f'scene-{index:02d}.wav'
        if audio:
            run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-i',str(audio),
                 '-af','aresample=48000,apad',
                 '-t',f'{total_duration:.6f}','-ac','2','-ar','48000','-c:a','pcm_s16le',str(prepared_audio)])
        else:
            run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo',
                 '-t',f'{total_duration:.6f}','-c:a','pcm_s16le',str(prepared_audio)])
        actual_duration = duration(prepared_audio)
        if abs(actual_duration-total_duration) > 0.03:
            raise ValueError(f'Scene {index} timing mismatch: {actual_duration} vs {total_duration}')
        audio_parts.append(prepared_audio)
        image_lines += [f"file '{esc(slide)}'",f'duration {total_duration:.6f}']
        timeline.append({**scene, 'start_seconds':round(elapsed,6),
                         'speech_duration_seconds':round(speech_duration,6),
                         'duration_seconds':round(total_duration,6),
                         'end_seconds':round(elapsed + total_duration,6)})
        elapsed += total_duration
    image_lines.append(f"file '{esc((base / data['scenes'][-1]['slide_path']).resolve())}'")
    images_concat = work / 'slides.ffconcat'
    images_concat.write_text('\n'.join(image_lines)+'\n')
    audio_concat = work / 'narration.ffconcat'
    audio_concat.write_text('ffconcat version 1.0\n'+'\n'.join(f"file '{esc(p)}'" for p in audio_parts)+'\n')
    narration = work / 'narration_master.wav'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(audio_concat),
         '-c:a','pcm_s16le',str(narration)])
    if abs(duration(narration)-elapsed) > 0.03:
        raise ValueError('Combined narration duration does not match scene timeline')
    mixed = work / 'audio_master.wav'
    if data.get('music_path'):
        music = (base/data['music_path']).resolve()
        # The independently normalized music sits ~24 dB below speech. It remains
        # restrained during silence; no pumping or automatic large rises.
        filters = (f'[0:a]atrim=0:{elapsed:.6f},asetpts=PTS-STARTPTS[voice];'
                   f'[1:a]aresample=48000,volume=0.04,'
                   f'afade=t=in:st=0:d=3,afade=t=out:st={max(0,elapsed-5):.6f}:d=5,'
                   f'atrim=0:{elapsed:.6f},asetpts=PTS-STARTPTS[music];'
                   '[voice][music]amix=inputs=2:duration=first:normalize=0,'
                   'loudnorm=I=-16:TP=-1:LRA=8,aresample=48000,apad[mix]')
        run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(narration),
             '-stream_loop','-1','-i',str(music),'-filter_complex',filters,'-map','[mix]',
             '-ar','48000','-ac','2','-c:a','pcm_s16le','-t',f'{elapsed:.6f}',str(mixed)])
    else:
        run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(narration),
             '-af','loudnorm=I=-16:TP=-1:LRA=8,aresample=48000,apad','-t',f'{elapsed:.6f}',
             '-ar','48000','-c:a','pcm_s16le',str(mixed)])
    if abs(duration(mixed)-elapsed) > 0.03:
        raise ValueError('Mixed audio duration does not match scene timeline')
    if not args.audio_only:
        run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(images_concat),
             '-i',str(mixed),'-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
             '-t',f'{elapsed:.6f}','-c:v','libx264','-preset','medium','-crf','20','-tune','stillimage',
             '-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(output)])
    result = {**data, 'scenes':timeline, 'duration_seconds':round(elapsed,6),
              'output_path':str(output), 'audio_master_path':str(mixed),
              'video_spec':{'width':1920,'height':1080,'fps':30,'audio_sample_rate':48000}}
    (work/'render_manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'output_path':str(mixed) if args.audio_only else str(output),'duration_seconds':round(elapsed,3),'size_bytes':mixed.stat().st_size if args.audio_only else output.stat().st_size}))


if __name__ == '__main__':
    main()

# Authoring sources for Lesson 01

These are the exact authoring scripts and frozen narration inputs used for the checked release. The editable DOCX and PPTX are the practical masters for ordinary revisions.

The scripts were executed in the managed production runtime. They retain its working paths and require the corresponding dependencies; they are preserved source, not a portable one-command installer. To rebuild, set the working paths to a dedicated build directory and supply the referenced source registry, case packet and media files. Review all re-rendered output before replacing a release.

- Fieldbook: Python, python-docx, DejaVu Sans; PDF rendering used the managed document renderer.
- Slides: Node.js, @oai/artifact-tool, the presentation skill utilities, Nimbus Sans.
- Slide PDF: Python, ReportLab, Pillow and the checked PNG renders.
- Video: Python, FFmpeg and the reviewed slide PNGs, exact narration assets and music bed.

Synthetic narration uses a stock voice. Source narration is frozen at SHA-256 46692b68121663734cd2cce97883d71867621f8b6f833f0ab7d445ce7d43a3d5. Generated audio and binary teaching outputs accompany the class package; account credentials and signed provider download URLs are not part of this repository.

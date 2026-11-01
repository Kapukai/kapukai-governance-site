BEGIN;
INSERT INTO kapukai_case_atlas.cases(id,title,state,government_level,pattern,evidence_status,source_review_date,record) VALUES ('barry-2016','Barry v. Lyon','MI','State','Automation substitutes for legal test','Court merits decision','2026-11-01','{"id": "barry-2016", "title": "Barry v. Lyon", "year": 2016, "state": "MI", "city": "Ann Arbor", "court": "Sixth Circuit; Eastern District of Michigan", "docket": "15-1390; district 5:13-cv-13185", "level": "State", "pattern": "Automation substitutes for legal test", "headline": "A match ended benefits. The law required more.", "sequence": ["Automated warrant match", "SNAP case closes with generic notice", "Class judgment for recipients affirmed"], "finding": "Michigan automatically disqualified SNAP recipients on warrant matches. Its policy violated SNAP and its notices denied due process.", "remedy": "Sixth Circuit affirmed district judgment August 25, 2016.", "status": "Published appellate holding affirming summary judgment", "limitation": "Historical Michigan policy; not a finding about all benefit algorithms. Official-capacity defendant does not imply personal liability.", "people": [{"name": "Nick Lyon", "role": "Official-capacity defendant as acting department director"}, {"name": "Judith E. Levy", "role": "District judge granting relief"}, {"name": "Martha Craig Daughtrey", "role": "Appellate opinion author"}], "sources": [{"title": "Barry v. Lyon, Sixth Circuit opinion", "url": "https://www.opn.ca6.uscourts.gov/opinions.pdf/16a0208p-06.pdf", "pinpoint": "Pages 1–3: judges, holding and automated fugitive-felon interface"}], "engineering_hypothesis": "Test executable eligibility rules against governing law and make notice and correction usable; no engineering-licensure issue was decided.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('herring-2009','Herring v. United States','AL','Local','Correction fails to propagate','Court merits decision','2026-11-01','{"id": "herring-2009", "title": "Herring v. United States", "year": 2009, "state": "AL", "city": "Coffee County / Dale County", "court": "U.S. Supreme Court; underlying prosecution in Middle District of Alabama", "docket": "07-513; 555 U.S. 135", "level": "Local", "pattern": "Correction fails to propagate", "headline": "The warrant was recalled. The database still said arrest.", "sequence": ["Warrant recalled five months earlier", "Database still reports active warrant", "Arrest precedes correction by minutes"], "finding": "A recalled warrant remained in Dale County''s database. Coffee County officers arrested Herring before the mistake was discovered.", "remedy": "Suppression denied; Supreme Court affirmed January 14, 2009.", "status": "Supreme Court opinion; remedy denied", "limitation": "The Court treated the error as isolated negligence, not proven systemic error. It did not find wrongdoing by arresting officers.", "people": [{"name": "Mark Anderson", "role": "Coffee County investigator who requested checks and arrested Herring"}, {"name": "Sandy Pope", "role": "Coffee County warrant clerk relaying inquiry and correction"}, {"name": "Sharon Morgan", "role": "Dale County warrant clerk who discovered and reported error"}, {"name": "John G. Roberts Jr.", "role": "Chief Justice; majority opinion author"}], "sources": [{"title": "Herring v. United States, official opinion", "url": "https://www.govinfo.gov/content/pkg/USREPORTS-555/pdf/USREPORTS-555-135.pdf", "pinpoint": "555 U.S. 137–138 (facts, five-month recall); 147–148 (holding)"}], "engineering_hypothesis": "Acknowledged revocation updates and underlying-record confirmation could reduce stale-authority errors; no engineer-signature requirement was decided.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('goodlett-warrant','United States v. Kelly Goodlett','KY','Local','False records and authorization','Guilty plea','2026-11-01','{"id": "goodlett-warrant", "title": "United States v. Kelly Goodlett", "year": 2022, "state": "KY", "city": "Louisville", "court": "U.S. District Court, Western District of Kentucky", "docket": "Not independently verified in reviewed release", "level": "Local", "pattern": "False records and authorization", "headline": "A false affidavit became authority to search a home.", "sequence": ["Detective helped falsify a warrant affidavit", "A search followed", "Detective admitted a conspiracy and cover story"], "finding": "Goodlett pleaded guilty and admitted conspiring to falsify the search-warrant affidavit for Breonna Taylor''s home and conceal it from investigators.", "remedy": "Federal criminal prosecution and guilty plea.", "status": "Guilty plea and admissions", "limitation": "This records the August 2022 plea, not current sentencing status. Her admissions must not be treated as convictions of other officers.", "people": [{"name": "Kelly Goodlett", "role": "Former LMPD detective; pleaded guilty"}, {"name": "Rebecca Grady Jennings", "role": "Federal judge accepting plea"}], "sources": [{"title": "DOJ guilty-plea announcement, August 23, 2022", "url": "https://www.justice.gov/archives/opa/pr/former-louisville-kentucky-police-detective-pleads-guilty-federal-crime-related-death-breonna", "pinpoint": "Opening findings and plea-agreement description"}], "engineering_hypothesis": "Verify source claims before authorizing force and preserve record provenance. This is evidence falsification, not proof that engineer absence caused the offense.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Guilty plea", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('ciavarella-juvenile','United States v. Mark A. Ciavarella / juvenile-detention corruption','PA','State','Financial conflicts','Criminal conviction','2026-11-01','{"id": "ciavarella-juvenile", "title": "United States v. Mark A. Ciavarella / juvenile-detention corruption", "year": 2011, "state": "PA", "city": "Scranton", "court": "U.S. District Court, Middle District of Pennsylvania; Luzerne County proceedings affected", "docket": "Not independently verified in reviewed releases", "level": "State", "pattern": "Financial conflicts", "headline": "Judicial decisions. Private detention. Hidden payments.", "sequence": ["Private juvenile facilities replaced county capacity", "Judges received concealed payments and juveniles were sent to facilities", "Federal prosecution and mass vacatur followed"], "finding": "Ciavarella was convicted in 2011. DOJ reported bribes and kickbacks connected to private juvenile detention; Pennsylvania vacated thousands of juvenile convictions.", "remedy": "28-year sentence; juvenile-case vacatur and oversight reforms. DOJ reported the sentence upheld in 2020 despite some counts being vacated.", "status": "Criminal conviction; subsequent count revisions", "limitation": "Historical 2011/2020 record, not current custody status. Do not claim every detention was individually bought or that all original counts remain valid.", "people": [{"name": "Mark A. Ciavarella", "role": "Former state juvenile/president judge; convicted"}, {"name": "Michael Conahan", "role": "Former state president judge; pleaded guilty to racketeering conspiracy"}, {"name": "Edwin M. Kosik", "role": "Federal sentencing judge"}, {"name": "Christopher C. Conner", "role": "Federal judge reviewing resentencing in 2020"}], "sources": [{"title": "FBI/USAO sentencing announcement, August 11, 2011", "url": "https://archives.fbi.gov/archives/philadelphia/press-releases/2011/former-pennsylvania-county-president-judge-and-juvenile-judge-mark-ciavarella-sentenced-to-28-years-in-prison", "pinpoint": "Trial evidence and juvenile-conviction vacatur"}, {"title": "DOJ resentencing update, August 2020", "url": "https://www.justice.gov/usao-mdpa/pr/corrupt-judge-s-request-resentencing-denied", "pinpoint": "Vacated counts and unchanged sentence"}], "engineering_hypothesis": "Independent conflict audits and traceable placement/payment decisions could expose risk. The crimes establish corruption, not a sole missing-engineer cause.", "evidence_type": "Criminal conviction", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('ms-l-tracking','Ms. L. v. ICE / separated-children tracking review','CA','Federal','Broken handoffs','Official investigation','2026-11-01','{"id": "ms-l-tracking", "title": "Ms. L. v. ICE / separated-children tracking review", "year": 2019, "state": "CA", "city": "San Diego", "court": "U.S. District Court, Southern District of California", "docket": "3:18-cv-00428", "level": "Federal", "pattern": "Broken handoffs", "headline": "Families were separated without a reliable cross-agency tracking system.", "sequence": ["DHS separated families and transferred children to HHS care", "Court ordered identification and reunification", "OIG documented tracking gaps and delayed identification"], "finding": "HHS OIG found that lack of an integrated tracking system complicated identifying separated children; some were still identified months after the court order.", "remedy": "Court-ordered reunification; OIG urged better communication, transparency and accountability.", "status": "Court order plus inspector-general findings", "limitation": "OIG operational findings are distinct from the court''s legal findings; this record is a 2019 snapshot, not current compliance status.", "people": [{"name": "Dana M. Sabraw", "role": "District judge, adjudicator"}], "sources": [{"title": "HHS OIG: Separated Children Placed in ORR Care", "url": "https://www.oig.hhs.gov/reports/all/2019/separated-children-placed-in-office-of-refugee-resettlement-care/", "pinpoint": "What We Found; What We Conclude"}, {"title": "Ms. L. case chronology — litigating counsel (party source)", "url": "https://www.aclu.org/cases/ms-l-v-ice", "pinpoint": "Case docket, court and Judge Dana Sabraw; use orders for holdings"}], "engineering_hypothesis": "Preserve parent-child linkage and verified handoffs. The review identifies a data-system failure, not engineer absence as the sole cause.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Official investigation", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('md-abbott','M.D. by Stukenberg v. Abbott','TX','State','Unsafe capacity and oversight','Court merits decision','2026-11-01','{"id": "md-abbott", "title": "M.D. by Stukenberg v. Abbott", "year": 2019, "state": "TX", "city": "Corpus Christi", "court": "U.S. District Court, Southern District of Texas; Fifth Circuit appeal", "docket": "18-40057 (appeal)", "level": "State", "pattern": "Unsafe capacity and oversight", "headline": "Overloaded caseworkers. Inadequate monitoring. Children exposed to harm.", "sequence": ["Children challenged Texas foster-care conditions", "Constitutional violations from workload and oversight were upheld", "Appellate court narrowed the remedy"], "finding": "The Fifth Circuit recounted upheld due-process violations from overburdened caseworkers and inadequate monitoring of licensed placements.", "remedy": "Some workload studies and monitoring affirmed; other provisions vacated or narrowed.", "status": "Merits findings; narrowed injunction", "limitation": "The court rejected the integrated-computer-system mandate. A technical remedy must address a proven violation; broader system redesign is not automatically available.", "people": [{"name": "Edith Brown Clement", "role": "Appellate opinion author"}, {"name": "Greg Abbott", "role": "Official-capacity defendant as governor"}, {"name": "Henry Whitman Jr.", "role": "Official-capacity agency commissioner defendant"}], "sources": [{"title": "Fifth Circuit remedial opinion, July 8, 2019", "url": "https://www.ca5.uscourts.gov/opinions/pub/18/18-40057-CV1.pdf", "pinpoint": "Pages 1–2, 5–11"}], "engineering_hypothesis": "Measure safe workloads and verify oversight. Neither sole causation by missing engineers nor a universal engineer-signoff duty was found.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('santosky-kramer','Santosky v. Kramer','NY','State','Insufficient evidence threshold','Court merits decision','2026-11-01','{"id": "santosky-kramer", "title": "Santosky v. Kramer", "year": 1982, "state": "NY", "city": "Kingston", "court": "Ulster County Family Court; U.S. Supreme Court review", "docket": "80-5889; 455 U.S. 745", "level": "State", "pattern": "Insufficient evidence threshold", "headline": "Irreversible family separation required a stronger standard of proof.", "sequence": ["New York allowed termination on a preponderance of evidence", "Parents challenged the risk of erroneous termination", "Supreme Court required at least clear and convincing evidence"], "finding": "Due process requires at least clear and convincing evidence before a state permanently terminates parental rights.", "remedy": "Judgment vacated and remanded for proceedings consistent with the constitutional standard.", "status": "Supreme Court merits decision", "limitation": "Does not determine that neglect never occurred or resolve every family fact. It addresses the evidentiary threshold.", "people": [{"name": "Harry A. Blackmun", "role": "Supreme Court majority opinion author"}, {"name": "Bernhardt S. Kramer", "role": "County social-services commissioner, named respondent"}], "sources": [{"title": "Official United States Reports: Santosky v. Kramer", "url": "https://www.govinfo.gov/app/details/USREPORTS-455/USREPORTS-455-745/context", "pinpoint": "455 U.S. 745, especially 754–770"}], "engineering_hypothesis": "Match evidentiary safeguards to irreversible consequences. No engineer-signoff requirement was decided.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('ferguson-2015','United States v. City of Ferguson','MO','Local','Incentives override safeguards','Official investigation','2026-11-01','{"id": "ferguson-2015", "title": "United States v. City of Ferguson", "year": 2015, "state": "MO", "city": "Ferguson", "court": "U.S. District Court, Eastern District of Missouri", "docket": "4:16-cv-00180-CDP", "level": "Local", "pattern": "Incentives override safeguards", "headline": "Revenue targets shaped enforcement.", "sequence": ["City revenue targets", "Pressure for citations and collections", "Federal findings and monitored reform"], "finding": "DOJ found unconstitutional police and municipal-court practices, undue emphasis on revenue generation and racial bias.", "remedy": "Consent decree entered April 19, 2016, with independent monitoring.", "status": "DOJ findings and consent decree; current compliance unassessed", "limitation": "Investigative findings and settlement are not criminal convictions. Separate from the Michael Brown shooting investigation. The consent decree disclaims admissions of liability.", "people": [{"name": "Catherine D. Perry", "role": "Federal judge approving consent decree; corrective role"}, {"name": "Ronald Brockmeyer", "role": "Municipal judge discussed in DOJ findings"}, {"name": "James W. Knowles III", "role": "Mayor signing decree for city"}], "sources": [{"title": "DOJ Ferguson findings report", "url": "https://www.justice.gov/crt/about/spl/documents/ferguson_findings_3-4-15.pdf", "pinpoint": "Part III: revenue generation; discussion of Judge Brockmeyer"}, {"title": "Ferguson consent decree", "url": "https://www.justice.gov/d9/ferguson_consentdecree_4-19-16.pdf", "pinpoint": "April 19, 2016; signature and judicial approval pages"}], "engineering_hypothesis": "Independent audits and public compliance evidence could test whether operational incentives undermine legal duties; absence of engineer sign-off was not adjudicated.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Official investigation", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('evans-1995','Arizona v. Evans','AZ','Local','Correction fails to propagate','Court merits decision','2026-11-01','{"id": "evans-1995", "title": "Arizona v. Evans", "year": 1995, "state": "AZ", "city": "Phoenix", "court": "U.S. Supreme Court, reviewing Arizona Supreme Court", "docket": "93-1660; 514 U.S. 1", "level": "Local", "pattern": "Correction fails to propagate", "headline": "A quashed warrant remained actionable on screen.", "sequence": ["Court quashes warrant", "Computer still lists it 17 days later", "Officer relies on entry to arrest"], "finding": "The police computer indicated an outstanding warrant that had already been quashed.", "remedy": "Reversed and remanded March 1, 1995; suppression not required for court employees'' clerical errors.", "status": "Supreme Court opinion; exclusionary remedy limited", "limitation": "No indication that the officer acted unreasonably in relying on the computer record; not an officer-misconduct finding.", "people": [{"name": "Bryan Sargent", "role": "Phoenix police officer relying on computer warrant entry"}, {"name": "William H. Rehnquist", "role": "Chief Justice; majority opinion author"}], "sources": [{"title": "Arizona v. Evans, official opinion", "url": "https://www.govinfo.gov/content/pkg/USREPORTS-514/pdf/USREPORTS-514-1.pdf", "pinpoint": "514 U.S. 4–5 (facts); 14–16 (remedy)"}], "engineering_hypothesis": "Verify completion of court-to-police warrant withdrawals. The opinion does not establish an absence of engineers as the cause.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('kw-armstrong-2015','K.W. v. Armstrong','ID','State','Decision cannot be meaningfully challenged','Preliminary relief','2026-11-01','{"id": "kw-armstrong-2015", "title": "K.W. v. Armstrong", "year": 2015, "state": "ID", "city": "Boise", "court": "Ninth Circuit; District of Idaho", "docket": "14-35296; district 1:12-cv-00022-BLW and 3:12-cv-00058-BLW", "level": "State", "pattern": "Decision cannot be meaningfully challenged", "headline": "The budget changed. The reasons were inadequate.", "sequence": ["Individual care budget reduced", "Inadequate notice limits challenge", "Preliminary class protection upheld"], "finding": "The Ninth Circuit upheld an injunction preventing individual Developmental Disabilities Waiver budget reductions without adequate notice.", "remedy": "Expanded preliminary injunction affirmed June 5, 2015.", "status": "Preliminary-injunction appeal; likely merits success, not final judgment", "limitation": "Not a final finding that an algorithm was defective or every reduction unlawful.", "people": [{"name": "Richard Armstrong", "role": "Official-capacity defendant; health and welfare director"}, {"name": "Lisa Hettinger", "role": "Official-capacity defendant; Medicaid administrator"}, {"name": "B. Lynn Winmill", "role": "Presiding district judge"}, {"name": "Milan D. Smith Jr.", "role": "Appellate majority opinion author"}], "sources": [{"title": "K.W. v. Armstrong, Ninth Circuit opinion", "url": "https://cdn.ca9.uscourts.gov/datastore/opinions/2015/06/05/14-35296.pdf", "pinpoint": "Pages 1–5: parties, judicial roles and scope of injunction"}], "engineering_hypothesis": "Explain inputs and reasons before deprivation and preserve meaningful challenge. Engineer sign-off is a proposed control, not this holding.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Preliminary relief", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('brown-plata','Brown v. Plata','CA','State','Unsafe capacity and oversight','Court merits decision','2026-11-01','{"id": "brown-plata", "title": "Brown v. Plata", "year": 2011, "state": "CA", "city": "Sacramento", "court": "Eastern/Northern Districts of California; U.S. Supreme Court review", "docket": "09-1233; 563 U.S. 493", "level": "State", "pattern": "Unsafe capacity and oversight", "headline": "Prison capacity overwhelmed the ability to provide constitutional care.", "sequence": ["Medical and mental-health violations persisted", "Earlier remedial efforts failed", "Population-reduction order reached the Supreme Court"], "finding": "The Supreme Court upheld a population-reduction order; overcrowding was a primary cause of unconstitutional care.", "remedy": "Population reduction under the Prison Litigation Reform Act, with ongoing remedial supervision.", "status": "Supreme Court merits decision", "limitation": "A historical merits decision, not a current assessment of California prisons. It does not establish that no engineers participated.", "people": [{"name": "Anthony M. Kennedy", "role": "Supreme Court majority opinion author"}, {"name": "Edmund G. Brown Jr.", "role": "Governor, official-capacity appellant"}], "sources": [{"title": "Official United States Reports, volume 563", "url": "https://www.supremecourt.gov/opinions/boundvolumes/563BV.pdf", "pinpoint": "Printed pages 493–545"}], "engineering_hypothesis": "Capacity limits and monitored outcomes are safety controls; professional signoff alone was not tested as the remedy.", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('houston-evaas','Houston Federation of Teachers v. Houston ISD','TX','Local','Opaque automation','Procedural ruling','2026-11-01','{"id": "houston-evaas", "title": "Houston Federation of Teachers v. Houston ISD", "year": 2017, "state": "TX", "city": "Houston", "court": "U.S. District Court, Southern District of Texas", "docket": "4:14-cv-01189", "level": "Local", "pattern": "Opaque automation", "headline": "Teachers faced job consequences from scores they could not reproduce.", "sequence": ["District used proprietary teacher-effectiveness scores", "Teachers challenged inability to verify the scores", "Procedural due-process claim survived summary judgment"], "finding": "The court denied the district summary judgment on procedural due process while granting it on other claims.", "remedy": "The due-process claim could proceed.", "status": "Claim survived summary judgment", "limitation": "This decision was not a final liability verdict on every disputed fact.", "people": [{"name": "Stephen Wm. Smith", "role": "U.S. magistrate judge, adjudicator"}], "sources": [{"title": "Amended summary judgment opinion, May 4, 2017", "url": "https://www.govinfo.gov/content/pkg/USCOURTS-txsd-4_14-cv-01189/pdf/USCOURTS-txsd-4_14-cv-01189-0.pdf", "pinpoint": "Procedural due-process discussion; concluding disposition"}], "engineering_hypothesis": "Independently reproducible scores and reviewable reasons could support meaningful challenges. Absence of engineers was not the holding.", "evidence_type": "Procedural ruling", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('cahoo-midas','Cahoo v. SAS Analytics Inc.','MI','State','Opaque automation','Procedural ruling','2026-11-01','{"id": "cahoo-midas", "title": "Cahoo v. SAS Analytics Inc.", "year": 2019, "state": "MI", "city": "Detroit", "court": "U.S. District Court, Eastern District of Michigan; Sixth Circuit appeal", "docket": "2:17-cv-10657; 18-1295/1296", "level": "State", "pattern": "Opaque automation", "headline": "Discrepancy. Fraud label. Collection. Plaintiffs challenged the pipeline.", "sequence": ["MiDAS flagged income discrepancies", "Plaintiffs alleged automated fraud findings and deficient notice", "Collections triggered a due-process challenge"], "finding": "The Sixth Circuit allowed the due-process claim to proceed past qualified-immunity dismissal.", "remedy": "Remand for further proceedings on due process.", "status": "Claim survived dismissal", "limitation": "Pleading-stage allegations were accepted as true; not final findings against each official. Other constitutional claims failed in this appeal.", "people": [{"name": "David M. Lawson", "role": "District judge, adjudicator"}, {"name": "Eric L. Clay", "role": "Appellate opinion author"}, {"name": "Sharon Moffet-Massey", "role": "Named agency defendant; alleged conduct not adjudicated here"}], "sources": [{"title": "Sixth Circuit opinion, January 3, 2019", "url": "https://www.opn.ca6.uscourts.gov/opinions.pdf/19a0001p-06.pdf", "pinpoint": "Pages 1–6, 17–24"}], "engineering_hypothesis": "Test fraud logic and false positives; preserve meaningful notice and contestability. Engineer-absence causation not established.", "evidence_type": "Procedural ruling", "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "reviewed_at": "2026-11-01", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}'),
('mahoney-capitol-police-2026','Mahoney v. United States Capitol Police Board','DC','Federal','Unbounded discretion','Court merits decision','2026-11-01','{"id": "mahoney-capitol-police-2026", "title": "Mahoney v. United States Capitol Police Board", "year": 2026, "state": "DC", "city": "Washington", "court": "U.S. Court of Appeals for the District of Columbia Circuit", "docket": "24-5207; originating D.D.C. 1:21-cv-02314", "level": "Federal", "pattern": "Unbounded discretion", "headline": "Speech permission depended on political sponsorship.", "sequence": ["Capitol rules barred public demonstrations on Eastern Steps without congressional sponsorship.", "Mahoney challenged the restriction; the district court ruled for him.", "The appellate court affirmed the First Amendment result but rejected universal relief."], "finding": "Congressional discretion over public speech made the restriction unreasonable, even in a nonpublic forum.", "remedy": "Universal injunction vacated; remanded for relief addressing Mahoney’s injury.", "status": "September 22, 2026 opinion reviewed; subsequent docket not certified.", "limitation": "No finding that an absent engineer caused the violation. Reviewing judges are not accused actors.", "people": [{"name": "Patrick J. Mahoney", "role": "Plaintiff"}, {"name": "Neomi Rao", "role": "Reviewing judge; majority author"}, {"name": "Karen LeCraft Henderson", "role": "Reviewing panel judge"}, {"name": "Judith W. Rogers", "role": "Reviewing judge; dissent"}], "authorities": ["United States Capitol Police Board — challenged policymaking body"], "sources": [{"title": "Official appellate opinion, September 22, 2026", "url": "https://media.cadc.uscourts.gov/opinions/docs/2026/09/24-5207-2194324.pdf", "pinpoint": "Opinion pp. 2–5, 19–23"}], "engineering_hypothesis": "Kapukai proposal: test permission rules for consistent, reviewable criteria and narrowly scoped remedies.", "reviewed_at": "2026-11-01", "docket_certified": false, "engineer_signoff_evidence": "Not established by reviewed source", "engineering_causation_status": "not_established", "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.", "evidence_type": "Court merits decision", "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."}') ON CONFLICT(id) DO UPDATE SET title=excluded.title,state=excluded.state,government_level=excluded.government_level,pattern=excluded.pattern,evidence_status=excluded.evidence_status,record=excluded.record,source_review_date=excluded.source_review_date,updated_at=now();
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('barry-2016','https://www.opn.ca6.uscourts.gov/opinions.pdf/16a0208p-06.pdf','Barry v. Lyon, Sixth Circuit opinion','Pages 1–3: judges, holding and automated fugitive-felon interface') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('barry-2016','Nick Lyon','Official-capacity defendant as acting department director') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('barry-2016','Judith E. Levy','District judge granting relief') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('barry-2016','Martha Craig Daughtrey','Appellate opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('herring-2009','https://www.govinfo.gov/content/pkg/USREPORTS-555/pdf/USREPORTS-555-135.pdf','Herring v. United States, official opinion','555 U.S. 137–138 (facts, five-month recall); 147–148 (holding)') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('herring-2009','Mark Anderson','Coffee County investigator who requested checks and arrested Herring') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('herring-2009','Sandy Pope','Coffee County warrant clerk relaying inquiry and correction') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('herring-2009','Sharon Morgan','Dale County warrant clerk who discovered and reported error') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('herring-2009','John G. Roberts Jr.','Chief Justice; majority opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('goodlett-warrant','https://www.justice.gov/archives/opa/pr/former-louisville-kentucky-police-detective-pleads-guilty-federal-crime-related-death-breonna','DOJ guilty-plea announcement, August 23, 2022','Opening findings and plea-agreement description') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('goodlett-warrant','Kelly Goodlett','Former LMPD detective; pleaded guilty') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('goodlett-warrant','Rebecca Grady Jennings','Federal judge accepting plea') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ciavarella-juvenile','https://archives.fbi.gov/archives/philadelphia/press-releases/2011/former-pennsylvania-county-president-judge-and-juvenile-judge-mark-ciavarella-sentenced-to-28-years-in-prison','FBI/USAO sentencing announcement, August 11, 2011','Trial evidence and juvenile-conviction vacatur') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ciavarella-juvenile','https://www.justice.gov/usao-mdpa/pr/corrupt-judge-s-request-resentencing-denied','DOJ resentencing update, August 2020','Vacated counts and unchanged sentence') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ciavarella-juvenile','Mark A. Ciavarella','Former state juvenile/president judge; convicted') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ciavarella-juvenile','Michael Conahan','Former state president judge; pleaded guilty to racketeering conspiracy') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ciavarella-juvenile','Edwin M. Kosik','Federal sentencing judge') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ciavarella-juvenile','Christopher C. Conner','Federal judge reviewing resentencing in 2020') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ms-l-tracking','https://www.oig.hhs.gov/reports/all/2019/separated-children-placed-in-office-of-refugee-resettlement-care/','HHS OIG: Separated Children Placed in ORR Care','What We Found; What We Conclude') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ms-l-tracking','https://www.aclu.org/cases/ms-l-v-ice','Ms. L. case chronology — litigating counsel (party source)','Case docket, court and Judge Dana Sabraw; use orders for holdings') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ms-l-tracking','Dana M. Sabraw','District judge, adjudicator') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('md-abbott','https://www.ca5.uscourts.gov/opinions/pub/18/18-40057-CV1.pdf','Fifth Circuit remedial opinion, July 8, 2019','Pages 1–2, 5–11') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('md-abbott','Edith Brown Clement','Appellate opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('md-abbott','Greg Abbott','Official-capacity defendant as governor') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('md-abbott','Henry Whitman Jr.','Official-capacity agency commissioner defendant') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('santosky-kramer','https://www.govinfo.gov/app/details/USREPORTS-455/USREPORTS-455-745/context','Official United States Reports: Santosky v. Kramer','455 U.S. 745, especially 754–770') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('santosky-kramer','Harry A. Blackmun','Supreme Court majority opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('santosky-kramer','Bernhardt S. Kramer','County social-services commissioner, named respondent') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ferguson-2015','https://www.justice.gov/crt/about/spl/documents/ferguson_findings_3-4-15.pdf','DOJ Ferguson findings report','Part III: revenue generation; discussion of Judge Brockmeyer') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('ferguson-2015','https://www.justice.gov/d9/ferguson_consentdecree_4-19-16.pdf','Ferguson consent decree','April 19, 2016; signature and judicial approval pages') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ferguson-2015','Catherine D. Perry','Federal judge approving consent decree; corrective role') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ferguson-2015','Ronald Brockmeyer','Municipal judge discussed in DOJ findings') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('ferguson-2015','James W. Knowles III','Mayor signing decree for city') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('evans-1995','https://www.govinfo.gov/content/pkg/USREPORTS-514/pdf/USREPORTS-514-1.pdf','Arizona v. Evans, official opinion','514 U.S. 4–5 (facts); 14–16 (remedy)') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('evans-1995','Bryan Sargent','Phoenix police officer relying on computer warrant entry') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('evans-1995','William H. Rehnquist','Chief Justice; majority opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('kw-armstrong-2015','https://cdn.ca9.uscourts.gov/datastore/opinions/2015/06/05/14-35296.pdf','K.W. v. Armstrong, Ninth Circuit opinion','Pages 1–5: parties, judicial roles and scope of injunction') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('kw-armstrong-2015','Richard Armstrong','Official-capacity defendant; health and welfare director') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('kw-armstrong-2015','Lisa Hettinger','Official-capacity defendant; Medicaid administrator') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('kw-armstrong-2015','B. Lynn Winmill','Presiding district judge') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('kw-armstrong-2015','Milan D. Smith Jr.','Appellate majority opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('brown-plata','https://www.supremecourt.gov/opinions/boundvolumes/563BV.pdf','Official United States Reports, volume 563','Printed pages 493–545') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('brown-plata','Anthony M. Kennedy','Supreme Court majority opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('brown-plata','Edmund G. Brown Jr.','Governor, official-capacity appellant') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('houston-evaas','https://www.govinfo.gov/content/pkg/USCOURTS-txsd-4_14-cv-01189/pdf/USCOURTS-txsd-4_14-cv-01189-0.pdf','Amended summary judgment opinion, May 4, 2017','Procedural due-process discussion; concluding disposition') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('houston-evaas','Stephen Wm. Smith','U.S. magistrate judge, adjudicator') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('cahoo-midas','https://www.opn.ca6.uscourts.gov/opinions.pdf/19a0001p-06.pdf','Sixth Circuit opinion, January 3, 2019','Pages 1–6, 17–24') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('cahoo-midas','David M. Lawson','District judge, adjudicator') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('cahoo-midas','Eric L. Clay','Appellate opinion author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('cahoo-midas','Sharon Moffet-Massey','Named agency defendant; alleged conduct not adjudicated here') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('mahoney-capitol-police-2026','https://media.cadc.uscourts.gov/opinions/docs/2026/09/24-5207-2194324.pdf','Official appellate opinion, September 22, 2026','Opinion pp. 2–5, 19–23') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('mahoney-capitol-police-2026','Patrick J. Mahoney','Plaintiff') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('mahoney-capitol-police-2026','Neomi Rao','Reviewing judge; majority author') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('mahoney-capitol-police-2026','Karen LeCraft Henderson','Reviewing panel judge') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('mahoney-capitol-police-2026','Judith W. Rogers','Reviewing judge; dissent') ON CONFLICT DO NOTHING;
INSERT INTO kapukai_case_atlas.editions(edition,published_snapshot,checksum_sha256,source_review_date) VALUES('1.0','{
  "edition": "1.0",
  "reviewed_at": "2026-11-01",
  "scope_note": "Selected U.S. public-source cases and official findings. This is an initial curated edition, not all online cases, a representative sample or a prevalence estimate. States without records are not yet indexed. Map geography is underlying jurisdiction, not deciding-court location.",
  "engineering_note": "Kapukai proposes publicly accountable engineering assurance for consequential decision systems. These records do not establish that an absent engineer caused the failure or that every government decision legally requires an engineer’s sign-off.",
  "cases": [
    {
      "id": "barry-2016",
      "title": "Barry v. Lyon",
      "year": 2016,
      "state": "MI",
      "city": "Ann Arbor",
      "court": "Sixth Circuit; Eastern District of Michigan",
      "docket": "15-1390; district 5:13-cv-13185",
      "level": "State",
      "pattern": "Automation substitutes for legal test",
      "headline": "A match ended benefits. The law required more.",
      "sequence": [
        "Automated warrant match",
        "SNAP case closes with generic notice",
        "Class judgment for recipients affirmed"
      ],
      "finding": "Michigan automatically disqualified SNAP recipients on warrant matches. Its policy violated SNAP and its notices denied due process.",
      "remedy": "Sixth Circuit affirmed district judgment August 25, 2016.",
      "status": "Published appellate holding affirming summary judgment",
      "limitation": "Historical Michigan policy; not a finding about all benefit algorithms. Official-capacity defendant does not imply personal liability.",
      "people": [
        {
          "name": "Nick Lyon",
          "role": "Official-capacity defendant as acting department director"
        },
        {
          "name": "Judith E. Levy",
          "role": "District judge granting relief"
        },
        {
          "name": "Martha Craig Daughtrey",
          "role": "Appellate opinion author"
        }
      ],
      "sources": [
        {
          "title": "Barry v. Lyon, Sixth Circuit opinion",
          "url": "https://www.opn.ca6.uscourts.gov/opinions.pdf/16a0208p-06.pdf",
          "pinpoint": "Pages 1–3: judges, holding and automated fugitive-felon interface"
        }
      ],
      "engineering_hypothesis": "Test executable eligibility rules against governing law and make notice and correction usable; no engineering-licensure issue was decided.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "herring-2009",
      "title": "Herring v. United States",
      "year": 2009,
      "state": "AL",
      "city": "Coffee County / Dale County",
      "court": "U.S. Supreme Court; underlying prosecution in Middle District of Alabama",
      "docket": "07-513; 555 U.S. 135",
      "level": "Local",
      "pattern": "Correction fails to propagate",
      "headline": "The warrant was recalled. The database still said arrest.",
      "sequence": [
        "Warrant recalled five months earlier",
        "Database still reports active warrant",
        "Arrest precedes correction by minutes"
      ],
      "finding": "A recalled warrant remained in Dale County''s database. Coffee County officers arrested Herring before the mistake was discovered.",
      "remedy": "Suppression denied; Supreme Court affirmed January 14, 2009.",
      "status": "Supreme Court opinion; remedy denied",
      "limitation": "The Court treated the error as isolated negligence, not proven systemic error. It did not find wrongdoing by arresting officers.",
      "people": [
        {
          "name": "Mark Anderson",
          "role": "Coffee County investigator who requested checks and arrested Herring"
        },
        {
          "name": "Sandy Pope",
          "role": "Coffee County warrant clerk relaying inquiry and correction"
        },
        {
          "name": "Sharon Morgan",
          "role": "Dale County warrant clerk who discovered and reported error"
        },
        {
          "name": "John G. Roberts Jr.",
          "role": "Chief Justice; majority opinion author"
        }
      ],
      "sources": [
        {
          "title": "Herring v. United States, official opinion",
          "url": "https://www.govinfo.gov/content/pkg/USREPORTS-555/pdf/USREPORTS-555-135.pdf",
          "pinpoint": "555 U.S. 137–138 (facts, five-month recall); 147–148 (holding)"
        }
      ],
      "engineering_hypothesis": "Acknowledged revocation updates and underlying-record confirmation could reduce stale-authority errors; no engineer-signature requirement was decided.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "goodlett-warrant",
      "title": "United States v. Kelly Goodlett",
      "year": 2022,
      "state": "KY",
      "city": "Louisville",
      "court": "U.S. District Court, Western District of Kentucky",
      "docket": "Not independently verified in reviewed release",
      "level": "Local",
      "pattern": "False records and authorization",
      "headline": "A false affidavit became authority to search a home.",
      "sequence": [
        "Detective helped falsify a warrant affidavit",
        "A search followed",
        "Detective admitted a conspiracy and cover story"
      ],
      "finding": "Goodlett pleaded guilty and admitted conspiring to falsify the search-warrant affidavit for Breonna Taylor''s home and conceal it from investigators.",
      "remedy": "Federal criminal prosecution and guilty plea.",
      "status": "Guilty plea and admissions",
      "limitation": "This records the August 2022 plea, not current sentencing status. Her admissions must not be treated as convictions of other officers.",
      "people": [
        {
          "name": "Kelly Goodlett",
          "role": "Former LMPD detective; pleaded guilty"
        },
        {
          "name": "Rebecca Grady Jennings",
          "role": "Federal judge accepting plea"
        }
      ],
      "sources": [
        {
          "title": "DOJ guilty-plea announcement, August 23, 2022",
          "url": "https://www.justice.gov/archives/opa/pr/former-louisville-kentucky-police-detective-pleads-guilty-federal-crime-related-death-breonna",
          "pinpoint": "Opening findings and plea-agreement description"
        }
      ],
      "engineering_hypothesis": "Verify source claims before authorizing force and preserve record provenance. This is evidence falsification, not proof that engineer absence caused the offense.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Guilty plea",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "ciavarella-juvenile",
      "title": "United States v. Mark A. Ciavarella / juvenile-detention corruption",
      "year": 2011,
      "state": "PA",
      "city": "Scranton",
      "court": "U.S. District Court, Middle District of Pennsylvania; Luzerne County proceedings affected",
      "docket": "Not independently verified in reviewed releases",
      "level": "State",
      "pattern": "Financial conflicts",
      "headline": "Judicial decisions. Private detention. Hidden payments.",
      "sequence": [
        "Private juvenile facilities replaced county capacity",
        "Judges received concealed payments and juveniles were sent to facilities",
        "Federal prosecution and mass vacatur followed"
      ],
      "finding": "Ciavarella was convicted in 2011. DOJ reported bribes and kickbacks connected to private juvenile detention; Pennsylvania vacated thousands of juvenile convictions.",
      "remedy": "28-year sentence; juvenile-case vacatur and oversight reforms. DOJ reported the sentence upheld in 2020 despite some counts being vacated.",
      "status": "Criminal conviction; subsequent count revisions",
      "limitation": "Historical 2011/2020 record, not current custody status. Do not claim every detention was individually bought or that all original counts remain valid.",
      "people": [
        {
          "name": "Mark A. Ciavarella",
          "role": "Former state juvenile/president judge; convicted"
        },
        {
          "name": "Michael Conahan",
          "role": "Former state president judge; pleaded guilty to racketeering conspiracy"
        },
        {
          "name": "Edwin M. Kosik",
          "role": "Federal sentencing judge"
        },
        {
          "name": "Christopher C. Conner",
          "role": "Federal judge reviewing resentencing in 2020"
        }
      ],
      "sources": [
        {
          "title": "FBI/USAO sentencing announcement, August 11, 2011",
          "url": "https://archives.fbi.gov/archives/philadelphia/press-releases/2011/former-pennsylvania-county-president-judge-and-juvenile-judge-mark-ciavarella-sentenced-to-28-years-in-prison",
          "pinpoint": "Trial evidence and juvenile-conviction vacatur"
        },
        {
          "title": "DOJ resentencing update, August 2020",
          "url": "https://www.justice.gov/usao-mdpa/pr/corrupt-judge-s-request-resentencing-denied",
          "pinpoint": "Vacated counts and unchanged sentence"
        }
      ],
      "engineering_hypothesis": "Independent conflict audits and traceable placement/payment decisions could expose risk. The crimes establish corruption, not a sole missing-engineer cause.",
      "evidence_type": "Criminal conviction",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "ms-l-tracking",
      "title": "Ms. L. v. ICE / separated-children tracking review",
      "year": 2019,
      "state": "CA",
      "city": "San Diego",
      "court": "U.S. District Court, Southern District of California",
      "docket": "3:18-cv-00428",
      "level": "Federal",
      "pattern": "Broken handoffs",
      "headline": "Families were separated without a reliable cross-agency tracking system.",
      "sequence": [
        "DHS separated families and transferred children to HHS care",
        "Court ordered identification and reunification",
        "OIG documented tracking gaps and delayed identification"
      ],
      "finding": "HHS OIG found that lack of an integrated tracking system complicated identifying separated children; some were still identified months after the court order.",
      "remedy": "Court-ordered reunification; OIG urged better communication, transparency and accountability.",
      "status": "Court order plus inspector-general findings",
      "limitation": "OIG operational findings are distinct from the court''s legal findings; this record is a 2019 snapshot, not current compliance status.",
      "people": [
        {
          "name": "Dana M. Sabraw",
          "role": "District judge, adjudicator"
        }
      ],
      "sources": [
        {
          "title": "HHS OIG: Separated Children Placed in ORR Care",
          "url": "https://www.oig.hhs.gov/reports/all/2019/separated-children-placed-in-office-of-refugee-resettlement-care/",
          "pinpoint": "What We Found; What We Conclude"
        },
        {
          "title": "Ms. L. case chronology — litigating counsel (party source)",
          "url": "https://www.aclu.org/cases/ms-l-v-ice",
          "pinpoint": "Case docket, court and Judge Dana Sabraw; use orders for holdings"
        }
      ],
      "engineering_hypothesis": "Preserve parent-child linkage and verified handoffs. The review identifies a data-system failure, not engineer absence as the sole cause.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Official investigation",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "md-abbott",
      "title": "M.D. by Stukenberg v. Abbott",
      "year": 2019,
      "state": "TX",
      "city": "Corpus Christi",
      "court": "U.S. District Court, Southern District of Texas; Fifth Circuit appeal",
      "docket": "18-40057 (appeal)",
      "level": "State",
      "pattern": "Unsafe capacity and oversight",
      "headline": "Overloaded caseworkers. Inadequate monitoring. Children exposed to harm.",
      "sequence": [
        "Children challenged Texas foster-care conditions",
        "Constitutional violations from workload and oversight were upheld",
        "Appellate court narrowed the remedy"
      ],
      "finding": "The Fifth Circuit recounted upheld due-process violations from overburdened caseworkers and inadequate monitoring of licensed placements.",
      "remedy": "Some workload studies and monitoring affirmed; other provisions vacated or narrowed.",
      "status": "Merits findings; narrowed injunction",
      "limitation": "The court rejected the integrated-computer-system mandate. A technical remedy must address a proven violation; broader system redesign is not automatically available.",
      "people": [
        {
          "name": "Edith Brown Clement",
          "role": "Appellate opinion author"
        },
        {
          "name": "Greg Abbott",
          "role": "Official-capacity defendant as governor"
        },
        {
          "name": "Henry Whitman Jr.",
          "role": "Official-capacity agency commissioner defendant"
        }
      ],
      "sources": [
        {
          "title": "Fifth Circuit remedial opinion, July 8, 2019",
          "url": "https://www.ca5.uscourts.gov/opinions/pub/18/18-40057-CV1.pdf",
          "pinpoint": "Pages 1–2, 5–11"
        }
      ],
      "engineering_hypothesis": "Measure safe workloads and verify oversight. Neither sole causation by missing engineers nor a universal engineer-signoff duty was found.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "santosky-kramer",
      "title": "Santosky v. Kramer",
      "year": 1982,
      "state": "NY",
      "city": "Kingston",
      "court": "Ulster County Family Court; U.S. Supreme Court review",
      "docket": "80-5889; 455 U.S. 745",
      "level": "State",
      "pattern": "Insufficient evidence threshold",
      "headline": "Irreversible family separation required a stronger standard of proof.",
      "sequence": [
        "New York allowed termination on a preponderance of evidence",
        "Parents challenged the risk of erroneous termination",
        "Supreme Court required at least clear and convincing evidence"
      ],
      "finding": "Due process requires at least clear and convincing evidence before a state permanently terminates parental rights.",
      "remedy": "Judgment vacated and remanded for proceedings consistent with the constitutional standard.",
      "status": "Supreme Court merits decision",
      "limitation": "Does not determine that neglect never occurred or resolve every family fact. It addresses the evidentiary threshold.",
      "people": [
        {
          "name": "Harry A. Blackmun",
          "role": "Supreme Court majority opinion author"
        },
        {
          "name": "Bernhardt S. Kramer",
          "role": "County social-services commissioner, named respondent"
        }
      ],
      "sources": [
        {
          "title": "Official United States Reports: Santosky v. Kramer",
          "url": "https://www.govinfo.gov/app/details/USREPORTS-455/USREPORTS-455-745/context",
          "pinpoint": "455 U.S. 745, especially 754–770"
        }
      ],
      "engineering_hypothesis": "Match evidentiary safeguards to irreversible consequences. No engineer-signoff requirement was decided.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "ferguson-2015",
      "title": "United States v. City of Ferguson",
      "year": 2015,
      "state": "MO",
      "city": "Ferguson",
      "court": "U.S. District Court, Eastern District of Missouri",
      "docket": "4:16-cv-00180-CDP",
      "level": "Local",
      "pattern": "Incentives override safeguards",
      "headline": "Revenue targets shaped enforcement.",
      "sequence": [
        "City revenue targets",
        "Pressure for citations and collections",
        "Federal findings and monitored reform"
      ],
      "finding": "DOJ found unconstitutional police and municipal-court practices, undue emphasis on revenue generation and racial bias.",
      "remedy": "Consent decree entered April 19, 2016, with independent monitoring.",
      "status": "DOJ findings and consent decree; current compliance unassessed",
      "limitation": "Investigative findings and settlement are not criminal convictions. Separate from the Michael Brown shooting investigation. The consent decree disclaims admissions of liability.",
      "people": [
        {
          "name": "Catherine D. Perry",
          "role": "Federal judge approving consent decree; corrective role"
        },
        {
          "name": "Ronald Brockmeyer",
          "role": "Municipal judge discussed in DOJ findings"
        },
        {
          "name": "James W. Knowles III",
          "role": "Mayor signing decree for city"
        }
      ],
      "sources": [
        {
          "title": "DOJ Ferguson findings report",
          "url": "https://www.justice.gov/crt/about/spl/documents/ferguson_findings_3-4-15.pdf",
          "pinpoint": "Part III: revenue generation; discussion of Judge Brockmeyer"
        },
        {
          "title": "Ferguson consent decree",
          "url": "https://www.justice.gov/d9/ferguson_consentdecree_4-19-16.pdf",
          "pinpoint": "April 19, 2016; signature and judicial approval pages"
        }
      ],
      "engineering_hypothesis": "Independent audits and public compliance evidence could test whether operational incentives undermine legal duties; absence of engineer sign-off was not adjudicated.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Official investigation",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "evans-1995",
      "title": "Arizona v. Evans",
      "year": 1995,
      "state": "AZ",
      "city": "Phoenix",
      "court": "U.S. Supreme Court, reviewing Arizona Supreme Court",
      "docket": "93-1660; 514 U.S. 1",
      "level": "Local",
      "pattern": "Correction fails to propagate",
      "headline": "A quashed warrant remained actionable on screen.",
      "sequence": [
        "Court quashes warrant",
        "Computer still lists it 17 days later",
        "Officer relies on entry to arrest"
      ],
      "finding": "The police computer indicated an outstanding warrant that had already been quashed.",
      "remedy": "Reversed and remanded March 1, 1995; suppression not required for court employees'' clerical errors.",
      "status": "Supreme Court opinion; exclusionary remedy limited",
      "limitation": "No indication that the officer acted unreasonably in relying on the computer record; not an officer-misconduct finding.",
      "people": [
        {
          "name": "Bryan Sargent",
          "role": "Phoenix police officer relying on computer warrant entry"
        },
        {
          "name": "William H. Rehnquist",
          "role": "Chief Justice; majority opinion author"
        }
      ],
      "sources": [
        {
          "title": "Arizona v. Evans, official opinion",
          "url": "https://www.govinfo.gov/content/pkg/USREPORTS-514/pdf/USREPORTS-514-1.pdf",
          "pinpoint": "514 U.S. 4–5 (facts); 14–16 (remedy)"
        }
      ],
      "engineering_hypothesis": "Verify completion of court-to-police warrant withdrawals. The opinion does not establish an absence of engineers as the cause.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "kw-armstrong-2015",
      "title": "K.W. v. Armstrong",
      "year": 2015,
      "state": "ID",
      "city": "Boise",
      "court": "Ninth Circuit; District of Idaho",
      "docket": "14-35296; district 1:12-cv-00022-BLW and 3:12-cv-00058-BLW",
      "level": "State",
      "pattern": "Decision cannot be meaningfully challenged",
      "headline": "The budget changed. The reasons were inadequate.",
      "sequence": [
        "Individual care budget reduced",
        "Inadequate notice limits challenge",
        "Preliminary class protection upheld"
      ],
      "finding": "The Ninth Circuit upheld an injunction preventing individual Developmental Disabilities Waiver budget reductions without adequate notice.",
      "remedy": "Expanded preliminary injunction affirmed June 5, 2015.",
      "status": "Preliminary-injunction appeal; likely merits success, not final judgment",
      "limitation": "Not a final finding that an algorithm was defective or every reduction unlawful.",
      "people": [
        {
          "name": "Richard Armstrong",
          "role": "Official-capacity defendant; health and welfare director"
        },
        {
          "name": "Lisa Hettinger",
          "role": "Official-capacity defendant; Medicaid administrator"
        },
        {
          "name": "B. Lynn Winmill",
          "role": "Presiding district judge"
        },
        {
          "name": "Milan D. Smith Jr.",
          "role": "Appellate majority opinion author"
        }
      ],
      "sources": [
        {
          "title": "K.W. v. Armstrong, Ninth Circuit opinion",
          "url": "https://cdn.ca9.uscourts.gov/datastore/opinions/2015/06/05/14-35296.pdf",
          "pinpoint": "Pages 1–5: parties, judicial roles and scope of injunction"
        }
      ],
      "engineering_hypothesis": "Explain inputs and reasons before deprivation and preserve meaningful challenge. Engineer sign-off is a proposed control, not this holding.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Preliminary relief",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "brown-plata",
      "title": "Brown v. Plata",
      "year": 2011,
      "state": "CA",
      "city": "Sacramento",
      "court": "Eastern/Northern Districts of California; U.S. Supreme Court review",
      "docket": "09-1233; 563 U.S. 493",
      "level": "State",
      "pattern": "Unsafe capacity and oversight",
      "headline": "Prison capacity overwhelmed the ability to provide constitutional care.",
      "sequence": [
        "Medical and mental-health violations persisted",
        "Earlier remedial efforts failed",
        "Population-reduction order reached the Supreme Court"
      ],
      "finding": "The Supreme Court upheld a population-reduction order; overcrowding was a primary cause of unconstitutional care.",
      "remedy": "Population reduction under the Prison Litigation Reform Act, with ongoing remedial supervision.",
      "status": "Supreme Court merits decision",
      "limitation": "A historical merits decision, not a current assessment of California prisons. It does not establish that no engineers participated.",
      "people": [
        {
          "name": "Anthony M. Kennedy",
          "role": "Supreme Court majority opinion author"
        },
        {
          "name": "Edmund G. Brown Jr.",
          "role": "Governor, official-capacity appellant"
        }
      ],
      "sources": [
        {
          "title": "Official United States Reports, volume 563",
          "url": "https://www.supremecourt.gov/opinions/boundvolumes/563BV.pdf",
          "pinpoint": "Printed pages 493–545"
        }
      ],
      "engineering_hypothesis": "Capacity limits and monitored outcomes are safety controls; professional signoff alone was not tested as the remedy.",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "houston-evaas",
      "title": "Houston Federation of Teachers v. Houston ISD",
      "year": 2017,
      "state": "TX",
      "city": "Houston",
      "court": "U.S. District Court, Southern District of Texas",
      "docket": "4:14-cv-01189",
      "level": "Local",
      "pattern": "Opaque automation",
      "headline": "Teachers faced job consequences from scores they could not reproduce.",
      "sequence": [
        "District used proprietary teacher-effectiveness scores",
        "Teachers challenged inability to verify the scores",
        "Procedural due-process claim survived summary judgment"
      ],
      "finding": "The court denied the district summary judgment on procedural due process while granting it on other claims.",
      "remedy": "The due-process claim could proceed.",
      "status": "Claim survived summary judgment",
      "limitation": "This decision was not a final liability verdict on every disputed fact.",
      "people": [
        {
          "name": "Stephen Wm. Smith",
          "role": "U.S. magistrate judge, adjudicator"
        }
      ],
      "sources": [
        {
          "title": "Amended summary judgment opinion, May 4, 2017",
          "url": "https://www.govinfo.gov/content/pkg/USCOURTS-txsd-4_14-cv-01189/pdf/USCOURTS-txsd-4_14-cv-01189-0.pdf",
          "pinpoint": "Procedural due-process discussion; concluding disposition"
        }
      ],
      "engineering_hypothesis": "Independently reproducible scores and reviewable reasons could support meaningful challenges. Absence of engineers was not the holding.",
      "evidence_type": "Procedural ruling",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "cahoo-midas",
      "title": "Cahoo v. SAS Analytics Inc.",
      "year": 2019,
      "state": "MI",
      "city": "Detroit",
      "court": "U.S. District Court, Eastern District of Michigan; Sixth Circuit appeal",
      "docket": "2:17-cv-10657; 18-1295/1296",
      "level": "State",
      "pattern": "Opaque automation",
      "headline": "Discrepancy. Fraud label. Collection. Plaintiffs challenged the pipeline.",
      "sequence": [
        "MiDAS flagged income discrepancies",
        "Plaintiffs alleged automated fraud findings and deficient notice",
        "Collections triggered a due-process challenge"
      ],
      "finding": "The Sixth Circuit allowed the due-process claim to proceed past qualified-immunity dismissal.",
      "remedy": "Remand for further proceedings on due process.",
      "status": "Claim survived dismissal",
      "limitation": "Pleading-stage allegations were accepted as true; not final findings against each official. Other constitutional claims failed in this appeal.",
      "people": [
        {
          "name": "David M. Lawson",
          "role": "District judge, adjudicator"
        },
        {
          "name": "Eric L. Clay",
          "role": "Appellate opinion author"
        },
        {
          "name": "Sharon Moffet-Massey",
          "role": "Named agency defendant; alleged conduct not adjudicated here"
        }
      ],
      "sources": [
        {
          "title": "Sixth Circuit opinion, January 3, 2019",
          "url": "https://www.opn.ca6.uscourts.gov/opinions.pdf/19a0001p-06.pdf",
          "pinpoint": "Pages 1–6, 17–24"
        }
      ],
      "engineering_hypothesis": "Test fraud logic and false positives; preserve meaningful notice and contestability. Engineer-absence causation not established.",
      "evidence_type": "Procedural ruling",
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "reviewed_at": "2026-11-01",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    },
    {
      "id": "mahoney-capitol-police-2026",
      "title": "Mahoney v. United States Capitol Police Board",
      "year": 2026,
      "state": "DC",
      "city": "Washington",
      "court": "U.S. Court of Appeals for the District of Columbia Circuit",
      "docket": "24-5207; originating D.D.C. 1:21-cv-02314",
      "level": "Federal",
      "pattern": "Unbounded discretion",
      "headline": "Speech permission depended on political sponsorship.",
      "sequence": [
        "Capitol rules barred public demonstrations on Eastern Steps without congressional sponsorship.",
        "Mahoney challenged the restriction; the district court ruled for him.",
        "The appellate court affirmed the First Amendment result but rejected universal relief."
      ],
      "finding": "Congressional discretion over public speech made the restriction unreasonable, even in a nonpublic forum.",
      "remedy": "Universal injunction vacated; remanded for relief addressing Mahoney’s injury.",
      "status": "September 22, 2026 opinion reviewed; subsequent docket not certified.",
      "limitation": "No finding that an absent engineer caused the violation. Reviewing judges are not accused actors.",
      "people": [
        {
          "name": "Patrick J. Mahoney",
          "role": "Plaintiff"
        },
        {
          "name": "Neomi Rao",
          "role": "Reviewing judge; majority author"
        },
        {
          "name": "Karen LeCraft Henderson",
          "role": "Reviewing panel judge"
        },
        {
          "name": "Judith W. Rogers",
          "role": "Reviewing judge; dissent"
        }
      ],
      "authorities": [
        "United States Capitol Police Board — challenged policymaking body"
      ],
      "sources": [
        {
          "title": "Official appellate opinion, September 22, 2026",
          "url": "https://media.cadc.uscourts.gov/opinions/docs/2026/09/24-5207-2194324.pdf",
          "pinpoint": "Opinion pp. 2–5, 19–23"
        }
      ],
      "engineering_hypothesis": "Kapukai proposal: test permission rules for consistent, reviewable criteria and narrowly scoped remedies.",
      "reviewed_at": "2026-11-01",
      "docket_certified": false,
      "engineer_signoff_evidence": "Not established by reviewed source",
      "engineering_causation_status": "not_established",
      "current_status_note": "Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.",
      "evidence_type": "Court merits decision",
      "signoff_research_needed": "Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation."
    }
  ]
}
','7e428060908be342cafd3b6d8bd18f6471c1eaae20ce0b00b071e0f7f9d0ad3f','2026-11-01') ON CONFLICT(edition) DO NOTHING;
COMMIT;

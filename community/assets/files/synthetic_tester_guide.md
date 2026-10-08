# Kapukai synthetic tester guide

**Draft tester instructions.** These instructions propose a safe testing process. They do not mean any tool is currently released, free, publicly available, or verified to work offline. Each tool must pass its own release checks before testers are invited to use it.

## Start with a fictional case

Use the two supplied fictional fixtures first. Every person, organization, address label, and event in those fixtures is invented. They contain no case numbers, real dates, links, quotations from actual proceedings, or real court records. Their purpose is to test how a tool handles records, attribution, discrepancies, uncertainty, and corrections.

**Replacing a name with Person1 is pseudonymization, not anonymization.** A record may still identify someone through its docket number, court, exact dates, unusual events, family relationships, locations, distinctive quotations, links, or file metadata. Public availability does not eliminate those risks.

Do not submit a real record to a tool and ask the tool to anonymize it after upload. By then, disclosure has already occurred. For this tester program, no restricted, sealed, or confidential child court record may be uploaded, even if names or other details have been redacted. Do not upload sensitive family narratives, recordings, photographs, or screenshots.

## If a public case inspired your test

You may use a lawfully public case to identify a general process problem, such as a receipt that conflicts with a later missing-document entry. Then create a new fictional scenario. A swapped-name copy of the real case is not suitable.

1. Write down only the general mechanism you want to test: for example, “two sources disagree about when an event occurred.”
2. Put the source material aside. Create new people, events, sequence, setting, and consequences sufficient to test that mechanism. Use Person1, Person2, Agency1, and Address1 as literal placeholder labels.
3. Use relative markers such as Day1 and Day2. Exclude real dates, case numbers, jurisdictions, links, recognizable quotations, and unusual personal details.
4. Create a new plain text file. Do not reuse a court PDF, image, audio file, or document that may retain metadata, annotations, hidden text, embedded objects, or revision history.
5. Ask whether a reader could connect your scenario to the original people from the combined details. If yes or uncertain, simplify and change it further, or use the supplied fixtures.
6. Label the file “FULLY FICTIONAL TEST DATA.” Keep any private source and the fictional fixture separate. Do not attach the original record to explain the test.

The aim is to reproduce a failure mechanism without reproducing a person's case. Do not present the fixture as evidence, an affidavit, or a legal finding.

## Run the two supplied tests

**Fixture 01: conflicting submission records.** Person1 reports submitting a document on Day2. A portal receipt also records acceptance on Day2. An Agency1 log records the same item as received on Day4, and a Day5 notice describes it as late against a Day3 deadline. Person2 reports an outage on Day3, without independent confirmation. The tool should preserve every source and identify the timeline discrepancy. It must not invent the reason for it, assume fraud, or decide whether the requirement was legally satisfied.

**Fixture 02: allegation versus finding.** Person2 reports seeing Person1 enter Address1 on Day1. An Agency1 note repeats that allegation. Person1 disputes it. A signed reviewer note on Day4 says the allegation has not been established on the supplied material. An automated Day5 summary nevertheless labels it a confirmed event. The tool should retain attribution, distinguish the reviewer's limited conclusion from proof of the opposite, and flag the unsupported promotion to “confirmed.” It must not invent a court order, missing evidence, intent, or legal liability.

For either fixture, check that the output uses only supplied facts; separates an event's alleged time from the time a record was created; preserves disagreement; and links statements to their sources. A transcript, receipt, signature, or repeated allegation does not establish every fact someone might infer from it.

## Check saving and offline behavior

Offline capability is a release requirement to verify, not an assumption. With the fictional fixture only, load the candidate tool, disconnect the network, and try its advertised local functions. Check typing, editing, draft export, and reopening an exported draft. Report which functions work and which show a clear limitation. A function that requires a server must not display false success when disconnected.

Check the exported file actually exists and can be reopened. A download is a snapshot. Changes made afterward require a new export. Local storage, if provided, is not an automatic backup and may not follow the tester to another browser or device. The release owner should separately inspect network requests to verify any claim that case content stays on the device; a page continuing to work offline does not prove it never transmitted data earlier.

## Report a bug without private data

Send the fixture ID, tool name and version, browser, steps, expected result, actual result, and whether the network was disconnected. Use a screenshot of fictional data only. Do not include real names, case records, private URLs, account tokens, or raw diagnostic logs containing personal information. If an upload appears to contain real information, stop using it and report the issue without forwarding the content to more people.

## Keep signup separate

The tester signup should request an email address, optional name, and tool interest only. It must not offer a case upload or request a legal history. State that the address will be used for requested tester communications. Provide a separate, unchecked choice for the newsletter and record that choice independently. Newsletter consent must not be required to test a tool. Invitations should clearly identify the available tool, limits, and support route only after readiness has been verified.

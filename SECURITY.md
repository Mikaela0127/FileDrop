# Security policy

FileDrop handles private file metadata, temporary storage capabilities, and an
owner session. Please report suspected vulnerabilities privately so users have
time to update before technical details become public.

## Supported versions

Security fixes are applied to the latest published version and the current
`main` branch. Older releases are not supported unless explicitly stated in
their release notes.

## Report a vulnerability

Use GitHub's private **Report a vulnerability** form in this repository's
Security tab when it is available. If the private form is not yet enabled, open
a public issue containing only a request for a private contact channel—do not
include vulnerability details. Do not include live credentials, session
cookies, share links, presigned URLs, private file names, or downloaded file
contents in either channel.

Include only the minimum information needed to reproduce the issue:

- the affected commit or release;
- the security boundary that appears to fail;
- redacted reproduction steps using disposable test data;
- the expected and observed result;
- a practical impact assessment.

The maintainer will aim to acknowledge a report within seven days. This
personal open-source project does not currently operate a paid bug-bounty
program.

## Testing boundaries

Use your own local deployment or resources you are authorized to test. Do not
access other users' files, retain data obtained during testing, perform
denial-of-service testing, send high-volume automated traffic, or test provider
infrastructure outside FileDrop's control.

High-value security properties include owner-authentication enforcement,
share-token confidentiality, short-lived presigned URLs, private object
storage, upload verification, metadata minimization, and reliable expiry and
deletion.

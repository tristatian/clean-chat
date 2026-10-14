# Security

Clean Chat runs entirely on your own computer: a Chrome extension that reads the chat page it is on, and a local reader that listens on `127.0.0.1` only. There is no Clean Chat server and no account.

## What it is designed to withstand

- **Hostile text in a chat.** Everything taken from a page or returned by a model is escaped before it is put back into HTML, in the extension, on the saved page and on the reader. A reply that contains script tags is shown as text.
- **Other websites talking to the reader.** The reader answers only its own page (same origin plus a custom header) and the extension it was introduced to; any other origin gets no cross-origin answer, so the browser stops the request.
- **The reader page writing into the extension.** The bridge accepts messages only from its own window and origin.
- **Secrets.** The extension never holds a key or token. Questions run through the official `claude` command with its own login; the reader passes your environment through and keeps none of it.
- **Supply chain.** No third-party JavaScript or Python packages. The extension is plain files; the reader uses the standard library only.

## What it does not protect against

- A program already running on your computer that takes port 8379 while the reader is not running could feed the saved page notes through the bridge.
- Text inside a chat can still try to steer the model that answers your question (prompt injection). The forked run is read-only (no shell, no edits, no web access) so the damage is limited to a bad answer.
- The optional Google Doc endpoint sends the notes you choose to save to the address you typed in. That is your choice and your account.

## Reporting a flaw

Please email **tianziyao5@gmail.com** with the steps to reproduce, or use GitHub's private vulnerability report on this repository if it is enabled. Do not open a public issue for a security problem until it is fixed. I am one person; expect an answer within a week.

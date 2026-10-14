# Contributing

Thank you for helping. The most useful contribution needs no code: open the chat site you use every day with Clean Chat loaded, and if something does not work, press **h** on the page, click **copy page info**, and paste it into a GitHub issue. It contains markup names only, no words from your conversation, and it is enough to write the fix.

If you send code:

- Fork the repository, make the change in your fork, and open a pull request. Keep each pull request to one thing.
- Do not move or rename the `extension` folder. Chrome ties a loaded extension's saved notes to its path.
- No build step and no dependencies, on purpose. Plain JavaScript and Python standard library only.
- Nothing may send data anywhere except `127.0.0.1` and the endpoint the user typed in themselves. See `SECURITY.md`.

**Licence of contributions.** By sending a pull request you agree that your change is licensed under AGPL-3.0 like the rest of the project, and you grant Ziyao Tian the right to include it in future versions under other licence terms. If you would rather not agree to that, please contribute by reporting instead; it is just as welcome.

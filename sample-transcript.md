You:
I have a major problem with LLMs today, especially in the web chat interface. I have multiple questions when I read an answer, and as I ask them the chat gets long and it's hard to scroll back and forth. What are some potential solutions?

Claude:
**Short version:** the strongest fix combines three ideas. Anchored threads for asking, a living document for accumulating, and an outline for navigating.

## Why the problem exists

A good long answer is tree-shaped: sections, sub-points, claims. Your reading is also tree-shaped. But the chat transcript is a list. Three things break:

1. **Lost anchor.** The follow-up answer lives far from the passage it explains.
2. **Interleaving.** Questions about different parts of the answer stack in the order you asked them.
3. **No overview.** You can't see the shape of the inquiry.

## Four solution families

- **Keep the list, add wayfinding.** Outline, collapsible turns, pins, search. Cheapest, least transformative.
- **Restructure the conversation.** Branches, Slack-style threads, anchored comments, a visible tree.
- **Reduce the number of turns.** Batch questions, progressive disclosure, pre-answered follow-ups.
- **Change the primary artifact.** A living document the model revises instead of a transcript it appends to.

> Trade-off: branches isolate context. Question two's branch doesn't know question one's answer.

```js
// context per thread
[system, originalQ, originalA, quote, question]
```

You:
I want to create a user interface that makes the chat seamless. Like reading a textbook with a highlighter and an eraser.

Claude:
### The idea in one paragraph

There are no chat bubbles. The answer is a page. Anything you understand, you erase, and the page shrinks. Anything you don't, you highlight and ask, and the answer appears right there under the passage. See [the mockup](https://example.com) for the interactions.

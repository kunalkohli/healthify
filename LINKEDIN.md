# LinkedIn post

Copy-paste ready. LinkedIn truncates around 200 characters, so the first two
lines have to earn the click.

---

## Main post

**723 characters.** Keep it under 800 — LinkedIn shows roughly the first
200 before "see more", and short posts outperform long ones.

```
🧠 Every time I asked an AI about my health, I started from zero. Who I am, what runs in my family, what I won't eat.

Health isn't a single conversation. It's longitudinal.

So I built Healthify 🩺 — a health companion that remembers you.

📋 Give it your family history once. It builds a profile loaded into every future chat.
💬 Then just ask. No re-explaining.
💾 After each chat it distils what it learned into facts you approve. Tomorrow starts with all of it.
🔒 Everything stays on your phone. No backend, no accounts, encrypted behind Face ID.

Open source — deploy your own.

📖 https://kunalkohli.github.io/articles/2026-09/healthify
💻 https://github.com/kunalkohli/healthify

⚠️ Not a medical device. Talk to a doctor.

#BuildInPublic #AI #LocalFirst #OpenSource
```

## Alternative — engineering angle

Worth posting separately a week later if the first one lands. Different audience,
different hook.

🐛 Three bugs from building an AI health app:

**1. I hardcoded a model ID and guessed the date suffix.** It 404'd. Now the app
fetches the model list from your account — which doubles as a key test.

**2. A coefficient I "remembered" as 23.98 is actually 23.9388.** Close enough to
look right, far enough to shift every number the app shows. Pulled it from a
reference implementation and pinned it with a test.

**3. A fix that typechecked clean and was still wrong.** I restored chat history
in one provider's message format and shipped it for all of them. TypeScript
can't verify that an `any[]` matches what a remote API expects.

The through-line: the app's whole premise is that you shouldn't trust a language
model to produce health numbers. Turns out you shouldn't trust me to recall
coefficients either. Same fix for both — deterministic code, tested against
published examples.

💻 https://github.com/kunalkohli/healthify

#BuildInPublic #TypeScript #AI #OpenSource

---

## Posting notes

- **Put the links in the first comment, not the post.** LinkedIn suppresses
  reach on posts with outbound links. Leave a "links in comments 👇" line instead.
- **Attach an image.** A screenshot of the Risks tab or the architecture diagram
  from the blog. Posts with images get materially more reach.
- **Keep the disclaimer.** It's the honest framing and it pre-empts the obvious
  reply.
- Markdown bold (`**`) doesn't render on LinkedIn — it'll show the asterisks.
  Either strip them, or convert to Unicode bold characters (𝗹𝗶𝗸𝗲 𝘁𝗵𝗶𝘀), though
  that isn't screen-reader friendly so use it sparingly.

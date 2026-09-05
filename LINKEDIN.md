# LinkedIn post

Copy-paste ready. LinkedIn truncates around 200 characters, so the first two
lines have to earn the click.

---

## Main post

🧠 Every time I asked an AI about my health, I started from zero.

Who I am. What runs in my family. What I won't eat. What I already tried that
didn't work.

By the time I'd finished setting the scene, I'd lost the will to ask the
question. A week later — same thing again.

But health doesn't work in single conversations. It's longitudinal. What matters
is the trend, the history, the context you build up over months.

So I built **Healthify** 🩺 — a health companion that actually remembers you.

📋 **You give it your history once**
Family history — who had what, and at what age — plus your basics and any lab
results. It builds a profile that loads into every future conversation.

💬 **Then you just talk to it**
What should I eat this week? What should I prioritise? What should I ask my
doctor? It already has your context. No re-explaining.

💾 **And it learns as you go**
At the end of a conversation it distils what it picked up into durable facts —
*"won't eat fish"*, *"travels a week a month"*, *"goal: lower blood pressure
before March"* — and asks you to approve each one. Tomorrow's chat starts with
all of it already loaded.

That last part is the whole thing. It stops being a chatbot you brief every time
and starts being a companion that knows you.

🔒 **All of it stays on your device**
Your family history, your labs, your conversations — none of it goes to a
server, because there isn't one. No backend, no database, no accounts, no
sign-up. It's encrypted in your phone's own storage behind a passphrase and
Face ID, and I couldn't read it even if I wanted to.

I did consider a hosted version with accounts. That idea lasted about ten
minutes — it would have meant volunteering to hold other people's family
medical history.

Open source — deploy your own copy in about ten minutes. It's yours, not mine.

📖 Write-up: https://kunalkohli.github.io/articles/2026-09/healthify
💻 Code: https://github.com/kunalkohli/healthify

⚠️ Not a medical device. Educational only — talk to an actual doctor.

#BuildInPublic #AI #LocalFirst #OpenSource #HealthTech

---

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

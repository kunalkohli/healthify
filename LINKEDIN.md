# LinkedIn post

Copy-paste ready. Three lengths — pick one. LinkedIn truncates at roughly 200
characters, so the first two lines have to earn the click.

---

## Option A — the main one (~1,300 chars)

I got tired of explaining myself to an AI every single time.

Every conversation starts from nothing. Who I am, what runs in my family, what I
won't eat, what I already tried that didn't stick. By the time you've set the
scene, you've lost the will to ask the question.

Health is the worst possible fit for that, because it's entirely longitudinal.

So I built Healthify — a personal health coach that runs on your phone and
actually remembers you.

Two design decisions I'd defend:

𝗘𝘃𝗲𝗿𝘆 𝗻𝘂𝗺𝗯𝗲𝗿 𝗰𝗼𝗺𝗲𝘀 𝗳𝗿𝗼𝗺 𝗮 𝗰𝗮𝗹𝗰𝘂𝗹𝗮𝘁𝗼𝗿, 𝗻𝗼𝘁 𝘁𝗵𝗲 𝗺𝗼𝗱𝗲𝗹.
Ask a chatbot for your 10-year cardiovascular risk and it gives you a confident,
plausible, invented number. Here the model can't compute one — it has to call a
tool running published instruments (FINDRISC, Framingham, ASCVD). And when a
calculator can't honestly run, it says so instead of guessing.

While building it I nearly wrote a coefficient as 23.98 from memory. The real
value is 23.9388. Small enough to look right, large enough to move every
cardiovascular number in the app. A test caught it.

𝗬𝗼𝘂𝗿 𝗱𝗮𝘁𝗮 𝗻𝗲𝘃𝗲𝗿 𝗹𝗲𝗮𝘃𝗲𝘀 𝘁𝗵𝗲 𝗱𝗲𝘃𝗶𝗰𝗲.
No backend, no database, no accounts. Everything sits encrypted in your phone's
storage behind a passphrase and Face ID. I considered a hosted multi-user
version for about ten minutes before realising I'd be volunteering to hold other
people's family medical history.

It's open source. Deploy your own in ten minutes — it's yours, not mine.

Write-up: https://kunalkohli.github.io/articles/2026-09/healthify
Code: https://github.com/kunalkohli/healthify

Not a medical device. Educational tool. Talk to an actual doctor.

#BuildInPublic #LocalFirst #AI #HealthTech #OpenSource #TypeScript

---

## Option B — short (~600 chars)

Ask an AI for your 10-year cardiovascular risk and it'll give you a confident,
plausible, completely invented number.

So I built one that isn't allowed to.

Healthify is a personal health coach where every figure comes from a published
calculator, not the model. When a calculator can't honestly run — wrong age
range, no bloodwork — it says so instead of estimating. It also remembers you
between conversations, so you stop re-explaining yourself.

No backend. No accounts. Everything encrypted on your own phone. Open source,
deploy your own.

https://github.com/kunalkohli/healthify

Not a medical device. Talk to a doctor.

#BuildInPublic #LocalFirst #AI #OpenSource

---

## Option C — engineering angle (~1,100 chars)

Three bugs from building an AI health app, each one a lesson:

𝟭. 𝗜 𝗵𝗮𝗿𝗱𝗰𝗼𝗱𝗲𝗱 𝗮 𝗺𝗼𝗱𝗲𝗹 𝗜𝗗 𝗮𝗻𝗱 𝗴𝘂𝗲𝘀𝘀𝗲𝗱 𝘁𝗵𝗲 𝗱𝗮𝘁𝗲 𝘀𝘂𝗳𝗳𝗶𝘅. It 404'd. Now the app
fetches the model list from your account — which doubles as a key test.

𝟮. 𝗔 𝗿𝗶𝘀𝗸 𝗰𝗼𝗲𝗳𝗳𝗶𝗰𝗶𝗲𝗻𝘁 𝗜 "𝗿𝗲𝗺𝗲𝗺𝗯𝗲𝗿𝗲𝗱" 𝗮𝘀 𝟮𝟯.𝟵𝟴 𝗶𝘀 𝗮𝗰𝘁𝘂𝗮𝗹𝗹𝘆 𝟮𝟯.𝟵𝟯𝟴𝟴. Close enough
to look right, far enough to shift every cardiovascular number the app shows.
Pulled from a reference implementation and pinned with a test.

𝟯. 𝗔 𝗳𝗶𝘅 𝘁𝗵𝗮𝘁 𝘁𝘆𝗽𝗲𝗰𝗵𝗲𝗰𝗸𝗲𝗱 𝗰𝗹𝗲𝗮𝗻 𝗮𝗻𝗱 𝘄𝗮𝘀 𝘀𝘁𝗶𝗹𝗹 𝘄𝗿𝗼𝗻𝗴. I restored chat history in
one provider's message format and shipped it for all of them. TypeScript can't
verify that an any[] matches what a remote API expects.

The through-line: the app's whole premise is that a language model shouldn't be
trusted to produce health numbers. Turns out I shouldn't be trusted to recall
coefficients either. Both problems have the same fix — deterministic code and
tests against published worked examples.

Healthify is open source. Local-first, encrypted on-device, no backend.

https://github.com/kunalkohli/healthify

#BuildInPublic #TypeScript #AI #OpenSource

---

## Notes

- **A** is the default — motivation first, then the two decisions worth talking about.
- **B** if you want something quick.
- **C** performs well with an engineering audience; the "I don't trust myself
  either" angle is more interesting than a feature list.
- Bold text uses Unicode maths characters because LinkedIn has no formatting.
  It isn't screen-reader friendly, so use it sparingly or drop it.
- Attach a screenshot of the Risks tab or the architecture diagram. Posts with
  an image get materially more reach, and LinkedIn suppresses outbound links —
  consider putting the URLs in the first comment instead.
- Keep the "not a medical device" line. It's the honest framing and it
  pre-empts the obvious reply.

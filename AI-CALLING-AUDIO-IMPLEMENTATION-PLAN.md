# AI Calling Audio Reliability — Implementation Plan

## Confirmed cause

- Deepgram created assistant text and raw 8 kHz PCMU audio correctly.
- SignalWire received outbound audio frames, but live code did not stop audio at `UserStartedSpeaking`.
- The code sent `clear` later at user end-of-turn. That raced the next assistant reply and flushed audio the prospect had not heard yet.
- Recent transcripts confirm the symptom: multiple humans said “you’re cutting off” and “I cannot hear you” while full assistant text existed.

## Implemented

1. Follow Deepgram's documented barge-in sequence: clear playback immediately on `UserStartedSpeaking`.
2. Gate new AI audio while the prospect is speaking.
3. Never clear the SignalWire playback buffer at user end-of-turn.
4. Keep a 1.2 second intro guard against line-noise false barge-in.
5. Apply conservative 1.15x PCMU output gain without changing codec or sample rate.
6. Use speed controls only on models that support them; older Aura voices receive no unsupported speed field.
7. Treat `press 1/2` as IVR/end, but `please hold` and `recorded for quality` as wait-for-human.

## Live verification

- One human-answer test: prospect must hear the full opening once.
- One interruption test: prospect speaks mid-sentence; current playback stops once and the reply resumes only after EOT.
- One hold/recording test: agent waits silently for the human.
- One press-menu test: call is classified IVR and ends.
- Check logs for `First AI audio frame sent`, no TTS 400 errors, and no repeated buffer clears after EOT.

## Rollback

- VM copies are backed up before deployment.
- Revert the three calling files and restart `enrichment-api` if the test call regresses.

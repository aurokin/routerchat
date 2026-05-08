# Settings Behavior: Defaults and Skills

This document describes the intended behavior for chat defaults and skills.

## Scope

- Applies to model, thinking, and search defaults.
- Applies to skill selection and skill defaults.
- Applies to chat entry initialization and message send flow.

## Definitions

- Defaults: persisted user preferences used to prefill new chats and initial chat state.
- Last user settings: the most recent user message in the current chat and its model/thinking/search.
- Manual change: a direct user action (UI selection or explicit shortcut) that selects a model, thinking, search, or skill.
- Auto change: an automatic selection triggered by app logic (for example, initial skill suggestion or reset).

## When defaults are loaded

- Defaults are read on app start and when contexts initialize.
- Chat entry uses defaults plus the last user message settings to set the initial per-chat settings.
- Skills are excluded from this chat entry default resolution.
- This load timing is fixed and should not be altered when adjusting send behavior.

## How initial chat settings are resolved

- If a chat has messages, use the most recent user message as the primary source for model, thinking, and search.
- If a value is missing on that message, fall back to persisted defaults for that field.
- If there are no messages, use persisted defaults.
- After resolution, constrain thinking/search to the active model capabilities.

## When defaults are updated

### Manual changes

- Manual model selection updates the model default.
- Manual thinking selection updates the thinking default.
- Manual search selection updates the search default.
- Manual skill selection updates the skill default.

### Auto changes

- Auto skill selection never updates the skill default.
- Auto model/thinking/search changes should not update defaults.

### Send behavior

- On send, persist the chat’s current model as the model default.
- On send, persist thinking/search defaults only if the active model supports them.
- On send, do not change the skill default. Skill behavior is handled separately.

## Skill selection behavior

- Selected skill can be in auto or manual mode.
- Only manual selection updates the default skill.
- Auto selection can change the active skill, but it must not persist as the default.
- After sending a message, skill selection resets to auto.

## Capability constraints

- Thinking defaults are only persisted when the model supports reasoning.
- Search defaults are only persisted when the model supports search/tools.
- If a model does not support a capability, the per-chat setting is forced to "none".

## Source of truth

- Shared helpers in `packages/shared/src/core/defaults/index.ts` are the source of truth for initial resolution.

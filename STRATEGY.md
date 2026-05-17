# Emotional Retrieval Strategy: DharmaMind

### 1. Multi-Stage Emotional Tagging
We use a tiered tagging system to map messy human emotions to structured wisdom:
- **Surface Emotion**: The user's direct expression (e.g., "I'm furious").
- **Root Theme**: The underlying spiritual/psychological category (e.g., "Anger", "Attachment").
- **Dharmic Archetype**: The specific type of internal struggle (e.g., "Expectation of Results", "Blocked Desire").

### 2. Retrieval Optimization (RAG Ideas)
- **Semantic Overlap**: Instead of keyword matching "anger," we look for semantic synonyms in the `practicalSituations` field of the JSON.
- **Dynamic Context Injection**: The API injects the user's current "Emotion Score" into the retrieval prompt to help the AI weigh which verse is most urgent.
- **Ethical Filter**: Before returning a verse, the system checks if the `ethicalPrinciples` for that verse directly address the user's detected destructive impulse.

### 3. Verification & Scaling
- **JSON Schema**: All verses MUST validate against `wisdom_schema.json` to ensure the UI doesn't break.
- **pgvector Integration**: In the next phase, these JSON objects will be embedded into vectors using `text-embedding-004` to enable millisecond-latency search across 700+ verses.

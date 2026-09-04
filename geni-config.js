import './source-modes.js?v=1';

export const GENI_TOKEN_SESSION_KEY = 'lineage-geni-access-token';
export const GENI_TOKEN_EXPIRY_KEY = 'lineage-geni-access-token-expiry';
export const GENI_IMPORT_INTENT_KEY = 'lineage-geni-descendant-intent-v1';
export const GENI_IMPORT_CHECKPOINT_KEY = 'lineage-geni-descendant-checkpoint-v1';
export const WORKSPACE_STORAGE_KEY = 'lineage-tree-workspace-v1';

// HistoryLink's graph traversal batches an entire generation's frontier.
// Fifty focus profiles per graph request is its long-tested working chunk size.
export const FAMILY_GRAPH_BATCH_SIZE = 50;
export const DEFAULT_REQUEST_DELAY_MS = 450;
export const DEFAULT_MAX_PROFILES = 500;
export const DEFAULT_MAX_REQUESTS = 240;

// Geni does not expose nested field projection such as birth.date.year.
// Request the smallest event objects that contain the years we need, then
// immediately reduce them to birthYear, deathYear, and marriageYears locally.
export const FAMILY_GRAPH_FIELDS = [
  'id', 'guid', 'name', 'display_name', 'profile_url', 'public',
  'gender', 'is_alive', 'living', 'birth', 'death', 'status', 'marriage'
].join(',');

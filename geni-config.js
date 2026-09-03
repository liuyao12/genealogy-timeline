import './source-modes.js?v=1';

export const GENI_TOKEN_SESSION_KEY = 'lineage-geni-access-token';
export const GENI_TOKEN_EXPIRY_KEY = 'lineage-geni-access-token-expiry';
export const GENI_IMPORT_INTENT_KEY = 'lineage-geni-descendant-intent-v1';
export const GENI_IMPORT_CHECKPOINT_KEY = 'lineage-geni-descendant-checkpoint-v1';
export const WORKSPACE_STORAGE_KEY = 'lineage-tree-workspace-v1';
export const PROFILE_BATCH_SIZE = 25;
export const UNION_BATCH_SIZE = 25;
export const DEFAULT_REQUEST_DELAY_MS = 450;
export const DEFAULT_MAX_PROFILES = 500;
export const DEFAULT_MAX_REQUESTS = 240;
export const PROFILE_FIELDS = [
  'id', 'guid', 'url', 'profile_url', 'public', 'display_name', 'name',
  'first_name', 'middle_name', 'last_name', 'maiden_name', 'suffix', 'title',
  'gender', 'is_alive', 'birth', 'death', 'birth_date', 'birth_date_parts',
  'death_date', 'death_date_parts', 'unions'
].join(',');
export const UNION_FIELDS = [
  'id', 'url', 'partners', 'children', 'adopted_children', 'foster_children',
  'status', 'marriage', 'divorce', 'marriage_date', 'divorce_date'
].join(',');

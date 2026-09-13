const SUPABASE_URL = 'https://vwxtjtixojubxlmshies.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kvAGmQmXhnYWf6li1Mn8lw_sPAN4Z2u';
const BUCKET_NAME = 'print-files'; window.BUCKET_NAME = BUCKET_NAME;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.supabaseClient = supabaseClient;
window.db = supabaseClient;

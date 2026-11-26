// Supabase client for the cleaning-bids board.
// The anon key is meant to live in client-side code (it only grants what
// the table's Row-Level-Security policies allow). Do NOT put the
// service_role / secret key here.
const SUPABASE_URL = "https://jtefgrlmtaufyyqjrilr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWZncmxtdGF1Znl5cWpyaWxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3MTUyNjUsImV4cCI6MjExMTI5MTI2NX0.hEEt20wmQGBDDfbClvRZTW9CqPTP_UgnVInf9g-UJlA";

// `supabase` is the global from the CDN <script>; createClient makes our client.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

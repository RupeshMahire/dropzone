require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initStorage() {
  console.log('--- Initializing Supabase Storage ---');
  
  const bucketName = 'transfers';

  // 1. Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('Error listing buckets:', listError.message);
    process.exit(1);
  }

  const bucketExists = buckets.some(b => b.name === bucketName);

  if (bucketExists) {
    console.log(`Bucket "${bucketName}" already exists.`);
  } else {
    console.log(`Creating bucket "${bucketName}"...`);
    const { data: newBucket, error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false, // Keep it private, accessed via Service Role or signed URLs (if needed)
      fileSizeLimit: 52428800, // 50MB (matching multer limit)
    });

    if (createError) {
      console.error('Error creating bucket:', createError.message);
      process.exit(1);
    }
    console.log(`Bucket "${bucketName}" created successfully.`);
  }

  console.log('--- SETUP COMPLETE ---');
  console.log('Now run the SQL in your Supabase dashboard to create the table.');
}

initStorage();

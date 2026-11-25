import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ejaykwdgzkcsvrgornaw.supabase.co';
const supabasePublishableKey = 'sb_publishable_QIy1RyCY_-V1To65nDbeZw_QQzi_Euu';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);



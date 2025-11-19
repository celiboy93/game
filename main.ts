const kv = await Deno.openKv();

Deno.serve(async (req) => {
    const keys = [];
    // List all existing keys in the database
    const iter = kv.list({ prefix: [] }); 

    for await (const entry of iter) {
        keys.push(entry.key);
    }

    // Delete all keys found
    await Promise.all(keys.map(key => kv.delete(key)));
    
    const message = `Database Cleaned! Total Records Deleted: ${keys.length}. 
    \nNOW REPLACE THIS CODE WITH THE FINAL SECURE SHOP CODE.`;
    
    return new Response(message, {
        headers: { "Content-Type": "text/plain" }
    });
});

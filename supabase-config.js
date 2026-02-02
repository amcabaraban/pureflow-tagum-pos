// ==================== SUPABASE CONFIGURATION ====================
// Replace these with your actual Supabase credentials
const SUPABASE_CONFIG = {
    url: 'https://hkwwqbydrpwuqptzqhhl.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd3dxYnlkcnB3dXFwdHpxaGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMzI2MzksImV4cCI6MjA4NDcwODYzOX0.Gbz84QaGeQuYPjtzPhc8h1Zmn-y0__qalMxu-kFt2V4' // From Supabase Settings > API
};

// ==================== DO NOT EDIT BELOW ====================
// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Store in global scope
window.supabaseClient = supabase;
window.SUPABASE_CONFIG = { url: SUPABASE_URL, key: SUPABASE_KEY };

// Generate device ID
const DEVICE_ID = localStorage.getItem('deviceId') || 
                  'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('deviceId', DEVICE_ID);
window.DEVICE_ID = DEVICE_ID;

// Network status
window.isOnline = navigator.onLine;

console.log('🚀 PureFlow POS v2.0 - Real-Time Sync Enabled');
console.log('📱 Device ID:', DEVICE_ID);
console.log('🌐 Online:', window.isOnline);

// Initialize real-time subscriptions
async function initializeRealtimeSubscriptions() {
    try {
        // Subscribe to sales changes
        const salesChannel = supabase
            .channel('sales-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'sales',
                },
                (payload) => {
                    console.log('📈 New sale from another device:', payload.new);
                    if (payload.new.device_id !== DEVICE_ID) {
                        showToast('🔄 New sale recorded from another device!', 'info');
                        updateDashboard();
                        loadRecentSales();
                    }
                }
            )
            .subscribe((status) => {
                console.log('Sales channel status:', status);
            });

        // Subscribe to orders changes
        const ordersChannel = supabase
            .channel('orders-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'client_orders',
                },
                (payload) => {
                    console.log('📦 Order update from another device:', payload);
                    if (payload.new && payload.new.id) {
                        showToast('📦 Order updated from another device!', 'info');
                        loadOrders();
                        if (window.currentClient) {
                            loadClientOrders();
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('Orders channel status:', status);
            });

        // Subscribe to customer changes
        const customersChannel = supabase
            .channel('customers-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'customers',
                },
                (payload) => {
                    console.log('👥 New customer from another device:', payload.new);
                    showToast('👥 New customer added from another device', 'info');
                    loadCustomers();
                }
            )
            .subscribe();

        window.realtimeChannels = {
            sales: salesChannel,
            orders: ordersChannel,
            customers: customersChannel
        };

        console.log('✅ Real-time subscriptions initialized');

    } catch (error) {
        console.error('❌ Failed to initialize real-time:', error);
    }
}

// Test connection and initialize
(async function() {
    try {
        const { data, error } = await supabase
            .from('sales')
            .select('count')
            .limit(1);
        
        if (error) throw error;
        console.log('✅ Supabase connected successfully');
        
        // Initialize real-time after successful connection
        initializeRealtimeSubscriptions();
        
    } catch (error) {
        console.log('⚠️ Supabase connection failed - running in offline mode');
    }
})();

// Network status monitoring
window.addEventListener('online', () => {
    window.isOnline = true;
    document.getElementById('syncStatus')?.textContent = 'Online';
    document.getElementById('syncIcon')?.className = 'fas fa-wifi';
    showToast('✅ Back online - syncing data...', 'success');
    syncOfflineData();
    initializeRealtimeSubscriptions();
});

window.addEventListener('offline', () => {
    window.isOnline = false;
    document.getElementById('syncStatus')?.textContent = 'Offline';
    document.getElementById('syncIcon')?.className = 'fas fa-wifi-slash';
    showToast('⚠️ You are offline - working locally', 'warning');

});



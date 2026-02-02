// Real-time synchronization module
class RealtimeSync {
    constructor() {
        this.channels = {};
        this.isConnected = false;
        this.lastSync = null;
        this.pendingChanges = [];
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window.isOnline) {
                this.syncNow();
            }
        });
        
        // Focus event
        window.addEventListener('focus', () => {
            if (window.isOnline) {
                this.syncNow();
            }
        });
        
        // Online/offline
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    async initialize() {
        if (!window.supabaseClient) {
            console.log('Supabase client not available');
            return;
        }
        
        try {
            // Test connection
            const { error } = await window.supabaseClient
                .from('sales')
                .select('count')
                .limit(1);
            
            if (error) throw error;
            
            this.setupChannels();
            this.isConnected = true;
            console.log('✅ Real-time sync initialized');
            
            // Initial sync
            this.syncNow();
            
        } catch (error) {
            console.error('❌ Real-time init failed:', error);
            this.isConnected = false;
        }
    }
    
    setupChannels() {
        // Sales channel
        this.channels.sales = window.supabaseClient
            .channel('sales-realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'sales'
            }, (payload) => {
                this.onNewSale(payload.new);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'sales'
            }, (payload) => {
                this.onUpdatedSale(payload.new);
            })
            .subscribe((status) => {
                console.log('Sales channel:', status);
            });
        
        // Orders channel
        this.channels.orders = window.supabaseClient
            .channel('orders-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'client_orders'
            }, (payload) => {
                this.onOrderChange(payload);
            })
            .subscribe();
        
        // Customers channel
        this.channels.customers = window.supabaseClient
            .channel('customers-realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'customers'
            }, (payload) => {
                this.onNewCustomer(payload.new);
            })
            .subscribe();
    }
    
    onNewSale(sale) {
        // Ignore if from current device
        if (sale.device_id === window.DEVICE_ID) return;
        
        console.log('📈 Remote sale detected:', sale);
        
        // Add to local storage
        this.addSaleToLocal(sale);
        
        // Update UI
        this.updateUIAfterSale(sale);
        
        // Show notification
        this.showNotification(
            'New Sale',
            `${sale.customer_name} - ₱${sale.amount}`,
            'sales'
        );
    }
    
    onOrderChange(payload) {
        const order = payload.new;
        const eventType = payload.eventType;
        
        console.log(`📦 Order ${eventType}:`, order);
        
        if (eventType === 'INSERT') {
            this.addOrderToLocal(order);
            this.showNotification(
                'New Order',
                `${order.client_name} - ${order.quantity} gallons`,
                'orders'
            );
        } else if (eventType === 'UPDATE') {
            this.updateOrderInLocal(order);
            this.showNotification(
                'Order Updated',
                `Order ${order.id} is now ${order.status}`,
                'orders'
            );
        }
        
        // Refresh orders UI
        this.refreshOrdersUI();
    }
    
    onNewCustomer(customer) {
        console.log('👥 New remote customer:', customer);
        
        this.addCustomerToLocal(customer);
        
        this.showNotification(
            'New Customer',
            customer.name,
            'customers'
        );
        
        this.refreshCustomersUI();
    }
    
    addSaleToLocal(sale) {
        const sales = JSON.parse(localStorage.getItem('sales') || '[]');
        
        // Check if already exists
        const exists = sales.some(s => s.cloud_id === sale.id);
        if (exists) return;
        
        sales.push({
            id: Date.now(),
            cloud_id: sale.id,
            customer: sale.customer_name,
            type: sale.customer_type,
            quantity: sale.quantity,
            amount: parseFloat(sale.amount),
            date: sale.created_at,
            timestamp: new Date(sale.created_at).getTime(),
            processedBy: sale.processed_by,
            userRole: sale.user_role,
            isRemote: true,
            device_id: sale.device_id
        });
        
        localStorage.setItem('sales', JSON.stringify(sales));
    }
    
    addOrderToLocal(order) {
        const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
        
        // Check if exists
        const exists = orders.some(o => o.id === order.id);
        if (exists) return;
        
        orders.push({
            id: order.id,
            clientName: order.client_name,
            clientPhone: order.client_phone,
            clientAddress: order.client_address,
            quantity: order.quantity,
            containerSize: order.container_size,
            totalAmount: parseFloat(order.total_amount),
            status: order.status,
            orderDate: order.created_at,
            timestamp: new Date(order.created_at).getTime(),
            isRemote: true
        });
        
        localStorage.setItem('clientOrders', JSON.stringify(orders));
    }
    
    async syncNow() {
        if (!window.isOnline || !this.isConnected) return;
        
        console.log('🔄 Manual sync triggered');
        
        try {
            // Sync sales
            const { data: sales } = await window.supabaseClient
                .from('sales')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (sales) this.mergeSales(sales);
            
            // Sync orders
            const { data: orders } = await window.supabaseClient
                .from('client_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (orders) this.mergeOrders(orders);
            
            // Update UI
            this.refreshAllUI();
            
            this.lastSync = new Date();
            this.updateSyncStatus();
            
            console.log('✅ Sync completed');
            
        } catch (error) {
            console.error('Sync error:', error);
        }
    }
    
    mergeSales(cloudSales) {
        const localSales = JSON.parse(localStorage.getItem('sales') || '[]');
        const cloudIds = new Set(cloudSales.map(s => s.id));
        
        // Add missing cloud sales
        cloudSales.forEach(cloudSale => {
            const exists = localSales.some(local => local.cloud_id === cloudSale.id);
            if (!exists) {
                localSales.push({
                    id: Date.now(),
                    cloud_id: cloudSale.id,
                    customer: cloudSale.customer_name,
                    type: cloudSale.customer_type,
                    quantity: cloudSale.quantity,
                    amount: parseFloat(cloudSale.amount),
                    date: cloudSale.created_at,
                    timestamp: new Date(cloudSale.created_at).getTime(),
                    processedBy: cloudSale.processed_by,
                    userRole: cloudSale.user_role,
                    isRemote: true
                });
            }
        });
        
        localStorage.setItem('sales', JSON.stringify(localSales));
    }
    
    updateUIAfterSale(sale) {
        // Update dashboard stats
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }
        
        // Update recent sales list
        if (typeof loadRecentSales === 'function') {
            loadRecentSales();
        }
        
        // Update reports if open
        if (document.querySelector('#reports.active') && typeof generateReport === 'function') {
            generateReport();
        }
    }
    
    refreshAllUI() {
        // Refresh all relevant UI components
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof loadRecentSales === 'function') loadRecentSales();
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadCustomers === 'function') loadCustomers();
        if (document.querySelector('#reports.active') && typeof generateReport === 'function') generateReport();
    }
    
    showNotification(title, message, type) {
        // Use existing toast or create new
        if (typeof showToast === 'function') {
            showToast(`${title}: ${message}`, 'info');
        } else {
            // Fallback notification
            if (Notification.permission === 'granted') {
                new Notification(title, { body: message });
            }
        }
    }
    
    handleOnline() {
        this.isConnected = true;
        console.log('🌐 Device is online');
        this.syncNow();
        
        // Reinitialize channels
        this.setupChannels();
    }
    
    handleOffline() {
        this.isConnected = false;
        console.log('📴 Device is offline');
        
        // Unsubscribe from channels
        Object.values(this.channels).forEach(channel => {
            channel.unsubscribe();
        });
        this.channels = {};
    }
    
    updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        const timeEl = document.getElementById('lastSyncTime');
        
        if (statusEl) {
            statusEl.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            statusEl.style.color = this.isConnected ? '#28a745' : '#dc3545';
        }
        
        if (timeEl && this.lastSync) {
            timeEl.textContent = this.lastSync.toLocaleTimeString();
        }
    }
}

// Initialize
window.realtimeSync = new RealtimeSync();

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.realtimeSync.initialize();
    }, 1000);
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealtimeSync;
}
// ================== GLOBAL VARIABLES ==================
let currentUser = null;
let currentClient = null;
let syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
let isOnline = navigator.onLine;
let basePrice = 15;
let sukiDiscount = 10;

// ================== INITIALIZATION ==================
document.addEventListener('DOMContentLoaded', function() {
    // Check if staff is already logged in
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp();
    }
    
    // Check if client is already logged in
    const savedClient = localStorage.getItem('currentClient');
    if (savedClient) {
        currentClient = JSON.parse(savedClient);
        showClientInterface();
    }
    
    // Load settings from Supabase
    loadSettings();
    
    // Sync offline data if online
    if (isOnline) {
        syncOfflineData();
    }
    
    // Initialize sample data if empty (only if no cloud data)
    initializeSampleData();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize date display
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Initialize client date display if needed
    if (currentClient) {
        updateClientDateTime();
        setInterval(updateClientDateTime, 1000);
    }
});

// ================== SYNC FUNCTIONS ==================
async function syncOfflineData() {
    if (syncQueue.length === 0 || !isOnline) return;
    
    console.log('🔄 Syncing offline data...', syncQueue.length, 'items');
    
    let successfulSyncs = 0;
    
    for (let i = 0; i < syncQueue.length; i++) {
        const item = syncQueue[i];
        
        try {
            let result;
            
            switch(item.table) {
                case 'sales':
                    result = await window.supabaseClient
                        .from('sales')
                        .insert([item.data]);
                    break;
                    
                case 'customers':
                    result = await window.supabaseClient
                        .from('customers')
                        .upsert([item.data], {
                            onConflict: 'name'
                        });
                    break;
                    
                case 'client_orders':
                    result = await window.supabaseClient
                        .from('client_orders')
                        .upsert([item.data], {
                            onConflict: 'id'
                        });
                    break;
                    
                case 'settings':
                    result = await window.supabaseClient
                        .from('settings')
                        .upsert([item.data], {
                            onConflict: 'id'
                        });
                    break;
            }
            
            if (result.error) {
                console.error('Sync error for item:', item, result.error);
                continue;
            }
            
            successfulSyncs++;
            syncQueue[i].synced = true;
            
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
    
    // Remove synced items
    syncQueue = syncQueue.filter(item => !item.synced);
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    
    if (successfulSyncs > 0) {
        showToast(`✅ Synced ${successfulSyncs} items to cloud`, 'success');
        // Refresh data from cloud
        loadCloudData();
    }
}

function addToSyncQueue(table, data) {
    syncQueue.push({
        table: table,
        data: data,
        timestamp: Date.now(),
        deviceId: window.DEVICE_ID,
        synced: false
    });
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    console.log('Added to sync queue:', table, data);
}

// ================== CLOUD DATA FUNCTIONS ==================
async function loadCloudData() {
    if (!isOnline) return;
    
    try {
        // Load sales
        const { data: sales } = await window.supabaseClient
            .from('sales')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (sales) {
            localStorage.setItem('sales', JSON.stringify(sales.map(formatSaleForLocal)));
        }
        
        // Load customers
        const { data: customers } = await window.supabaseClient
            .from('customers')
            .select('*');
        
        if (customers) {
            localStorage.setItem('customers', JSON.stringify(customers.map(formatCustomerForLocal)));
        }
        
        // Load orders
        const { data: orders } = await window.supabaseClient
            .from('client_orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (orders) {
            localStorage.setItem('clientOrders', JSON.stringify(orders.map(formatOrderForLocal)));
        }
        
        console.log('✅ Cloud data loaded successfully');
        
    } catch (error) {
        console.error('Failed to load cloud data:', error);
    }
}

function formatSaleForLocal(sale) {
    return {
        id: sale.id,
        customer: sale.customer_name,
        type: sale.customer_type,
        quantity: sale.quantity,
        amount: parseFloat(sale.amount),
        date: sale.created_at,
        timestamp: new Date(sale.created_at).getTime(),
        processedBy: sale.processed_by,
        userRole: sale.user_role
    };
}

function formatCustomerForLocal(customer) {
    return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        type: customer.type,
        totalSpent: parseFloat(customer.total_spent || 0),
        purchaseCount: customer.purchase_count || 0,
        lastPurchase: customer.last_purchase
    };
}

function formatOrderForLocal(order) {
    return {
        id: order.id,
        clientName: order.client_name,
        clientPhone: order.client_phone,
        clientAddress: order.client_address,
        quantity: order.quantity,
        containerSize: order.container_size,
        containerType: order.container_type,
        totalAmount: parseFloat(order.total_amount),
        status: order.status,
        orderDate: order.created_at,
        timestamp: new Date(order.created_at).getTime(),
        fulfilled: order.fulfilled || false
    };
}

// ================== UPDATED SALES FUNCTION ==================
async function processSale() {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    const customerType = document.getElementById('customerType').value;
    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    const amount = calculateTotal();
    
    if (customerType === 'suki' && !customerName) {
        showToast('Please enter customer name for Suki sale', 'error');
        return;
    }
    
    const saleData = {
        customer_name: customerName || 'Walk-in',
        customer_type: customerType,
        quantity: quantity,
        amount: amount,
        processed_by: currentUser.username,
        user_role: currentUser.role,
        device_id: window.DEVICE_ID
    };
    
    // Try to save to Supabase
    if (isOnline) {
        try {
            const { data, error } = await window.supabaseClient
                .from('sales')
                .insert([saleData]);
            
            if (error) throw error;
            
            showToast('✅ Sale saved to cloud!', 'success');
            
        } catch (error) {
            console.error('Cloud save failed:', error);
            // Fallback to offline
            addToSyncQueue('sales', saleData);
            showToast('💾 Saved locally (will sync later)', 'warning');
        }
    } else {
        // Offline mode
        addToSyncQueue('sales', saleData);
        showToast('💾 Saved locally (offline)', 'warning');
    }
    
    // Always save to localStorage for immediate UI update
    const localSale = {
        id: Date.now(),
        customer: customerName || 'Walk-in',
        type: customerType,
        quantity: quantity,
        amount: amount,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        processedBy: currentUser.username,
        userRole: currentUser.role
    };
    
    saveToLocalStorage('sales', localSale);
    
    // Update customer if name provided
    if (customerName && customerName !== 'Walk-in') {
        await updateOrCreateCustomer(customerName, customerType, amount);
    }
    
    // Clear form and update UI
    document.getElementById('customerName').value = '';
    document.getElementById('quantity').value = 1;
    calculateTotal();
    updateTodaySummary();
    loadCustomers();
    updateCustomerSuggestions();
    generateReport();
}

async function updateOrCreateCustomer(name, type, amount) {
    const customerData = {
        name: name,
        type: type,
        total_spent: amount,
        purchase_count: 1,
        last_purchase: new Date().toISOString()
    };
    
    if (isOnline) {
        try {
            await window.supabaseClient
                .from('customers')
                .upsert([customerData], {
                    onConflict: 'name'
                });
        } catch (error) {
            addToSyncQueue('customers', customerData);
        }
    } else {
        addToSyncQueue('customers', customerData);
    }
}

// ================== UPDATED CLIENT ORDER FUNCTION ==================
async function submitClientOrder() {
    if (!currentClient) {
        showToast('Please login first', 'error');
        return;
    }
    
    const quantity = parseInt(document.getElementById('clientQuantity').value) || 1;
    const containerSize = parseInt(document.getElementById('containerSize').value) || 5;
    const totalAmount = calculateClientTotal();
    const orderId = 'ORD' + Date.now().toString().slice(-6);
    
    const pricePerUnit = containerSize === 5 ? 15 : containerSize === 3 ? 10 : 5;
    
    const orderData = {
        id: orderId,
        client_name: currentClient.name,
        client_phone: currentClient.phone,
        client_address: currentClient.address,
        quantity: quantity,
        container_size: containerSize,
        price_per_unit: pricePerUnit,
        total_amount: totalAmount,
        status: 'pending'
    };
    
    // Try to save to Supabase
    if (isOnline) {
        try {
            const { data, error } = await window.supabaseClient
                .from('client_orders')
                .insert([orderData]);
            
            if (error) throw error;
            
            showToast('✅ Order submitted to cloud!', 'success');
            
        } catch (error) {
            console.error('Cloud save failed:', error);
            addToSyncQueue('client_orders', orderData);
            showToast('💾 Saved locally (will sync later)', 'warning');
        }
    } else {
        addToSyncQueue('client_orders', orderData);
        showToast('💾 Saved locally (offline)', 'warning');
    }
    
    // Save to localStorage
    const localOrder = {
        id: orderId,
        clientId: currentClient.id,
        clientName: currentClient.name,
        clientPhone: currentClient.phone,
        clientAddress: currentClient.address,
        quantity: quantity,
        containerSize: containerSize,
        containerType: containerSize + ' Gallon',
        pricePerUnit: pricePerUnit,
        totalAmount: totalAmount,
        deliverySchedule: 'ASAP',
        status: 'pending',
        orderDate: new Date().toISOString(),
        timestamp: Date.now()
    };
    
    saveToLocalStorage('clientOrders', localOrder);
    
    document.getElementById('clientQuantity').value = 1;
    calculateClientTotal();
    loadClientOrders();
}

// ================== UPDATED SETTINGS FUNCTION ==================
async function loadSettings() {
    // Try cloud first
    if (isOnline) {
        try {
            const { data, error } = await window.supabaseClient
                .from('settings')
                .select('*')
                .single();
            
            if (!error && data) {
                basePrice = parseFloat(data.base_price);
                sukiDiscount = data.suki_discount;
                
                // Update UI
                document.getElementById('storeName').value = data.store_name;
                document.getElementById('storeTitle').textContent = data.store_name;
                document.getElementById('basePrice').value = basePrice;
                document.getElementById('sukiDiscount').value = sukiDiscount;
                
                // Save to localStorage for offline
                localStorage.setItem('storeName', data.store_name);
                localStorage.setItem('basePrice', basePrice);
                localStorage.setItem('sukiDiscount', sukiDiscount);
                
                console.log('Settings loaded from cloud');
                return;
            }
        } catch (error) {
            console.log('Failed to load settings from cloud:', error);
        }
    }
    
    // Fallback to localStorage
    const storeName = localStorage.getItem('storeName') || 'PureFlow POS';
    const savedBasePrice = localStorage.getItem('basePrice');
    const savedSukiDiscount = localStorage.getItem('sukiDiscount');
    
    document.getElementById('storeName').value = storeName;
    document.getElementById('storeTitle').textContent = storeName;
    
    if (savedBasePrice) {
        basePrice = parseInt(savedBasePrice);
        document.getElementById('basePrice').value = basePrice;
    }
    
    if (savedSukiDiscount) {
        sukiDiscount = parseInt(savedSukiDiscount);
        document.getElementById('sukiDiscount').value = sukiDiscount;
    }
}

async function saveSettings() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can change settings', 'error');
        return;
    }
    
    const storeName = document.getElementById('storeName').value.trim();
    const newBasePrice = parseInt(document.getElementById('basePrice').value);
    const newSukiDiscount = parseInt(document.getElementById('sukiDiscount').value);
    
    const settingsData = {
        id: 'store_settings',
        store_name: storeName,
        base_price: newBasePrice,
        suki_discount: newSukiDiscount
    };
    
    // Save to cloud
    if (isOnline) {
        try {
            const { data, error } = await window.supabaseClient
                .from('settings')
                .upsert([settingsData], {
                    onConflict: 'id'
                });
            
            if (error) throw error;
            
            showToast('✅ Settings saved to cloud!', 'success');
            
        } catch (error) {
            console.error('Cloud save failed:', error);
            addToSyncQueue('settings', settingsData);
            showToast('💾 Saved locally (will sync later)', 'warning');
        }
    } else {
        addToSyncQueue('settings', settingsData);
        showToast('💾 Saved locally (offline)', 'warning');
    }
    
    // Always update localStorage
    localStorage.setItem('storeName', storeName);
    localStorage.setItem('basePrice', newBasePrice);
    localStorage.setItem('sukiDiscount', newSukiDiscount);
    
    basePrice = newBasePrice;
    sukiDiscount = newSukiDiscount;
    
    // Update UI
    document.getElementById('storeTitle').textContent = storeName;
    calculateTotal(); // Update current sale total
}

// ================== UPDATED ORDERS REPORT ==================
async function loadOrdersReport() {
    // Try cloud first
    if (isOnline) {
        try {
            const { data: orders, error } = await window.supabaseClient
                .from('client_orders')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (!error && orders) {
                displayOrders(orders);
                updateOrdersStatistics(orders);
                // Sync to localStorage
                localStorage.setItem('clientOrders', JSON.stringify(orders.map(formatOrderForLocal)));
                return;
            }
        } catch (error) {
            console.log('Failed to load orders from cloud:', error);
        }
    }
    
    // Fallback to localStorage
    const localOrders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    displayOrders(localOrders.map(order => ({
        id: order.id,
        client_name: order.clientName,
        client_phone: order.clientPhone,
        client_address: order.clientAddress,
        quantity: order.quantity,
        container_size: order.containerSize,
        total_amount: order.totalAmount,
        status: order.status,
        created_at: order.orderDate
    })));
    updateOrdersStatistics(localOrders);
}

function displayOrders(orders) {
    const tableBody = document.getElementById('ordersReportTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (orders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-clipboard-list" style="font-size: 48px; margin-bottom: 10px; opacity: 0.3;"></i><br>
                    No orders found
                </td>
            </tr>
        `;
        return;
    }
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        const orderDate = new Date(order.created_at);
        const formattedDate = orderDate.toLocaleDateString() + ' ' + orderDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const isFulfilled = order.status === 'delivered';
        const isCancelled = order.status === 'cancelled';
        const fulfillmentStatus = isFulfilled ? 'Fulfilled ✓' : 
                                 isCancelled ? 'Cancelled ✗' : 'Not Yet Fulfilled';
        
        row.innerHTML = `
            <td><strong>${order.id}</strong></td>
            <td>${formattedDate}</td>
            <td>${order.client_name}</td>
            <td>${order.client_phone}</td>
            <td>${order.quantity} × ${order.container_size} Gallon</td>
            <td>₱${parseFloat(order.total_amount).toFixed(2)}</td>
            <td>ASAP</td>
            <td><span class="order-status ${order.status}">${order.status}</span></td>
            <td><span class="fulfillment-status ${isFulfilled ? 'fulfilled' : isCancelled ? 'cancelled' : 'pending'}">${fulfillmentStatus}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="showUpdateOrderModal('${order.id}')" title="Update Status">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// ================== HELPER FUNCTIONS ==================
function saveToLocalStorage(key, newItem) {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    items.push(newItem);
    localStorage.setItem(key, JSON.stringify(items));
}

// ================== REST OF YOUR ORIGINAL FUNCTIONS ==================
// All other functions from your original script.js remain the same
// (login functions, UI functions, calculations, etc.)
// Just replace the ones above with these sync versions

// Add network status tracking
window.addEventListener('online', () => {
    isOnline = true;
    console.log('Device is online');
    syncOfflineData();
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('Device is offline');
});

// Initialize isOnline
isOnline = navigator.onLine;
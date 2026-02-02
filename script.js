// ================== GLOBAL VARIABLES ==================
let currentUser = null;
let currentClient = null;
let isOnline = navigator.onLine;
let syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
let basePrice = 15;
let sukiDiscount = 10;

// ================== INITIALIZATION ==================
document.addEventListener('DOMContentLoaded', async function() {
    // Show loading
    document.getElementById('loading').style.display = 'flex';
    
    // Generate device ID
    if (!localStorage.getItem('deviceId')) {
        localStorage.setItem('deviceId', 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    }
    window.DEVICE_ID = localStorage.getItem('deviceId');
    
    // Check for saved users
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        await showApp();
    }
    
    // Check for saved client
    const savedClient = localStorage.getItem('currentClient');
    if (savedClient) {
        currentClient = JSON.parse(savedClient);
        showClientInterface();
    }
    
    // Initialize sample data
    initializeSampleData();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize date/time displays
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Set up network listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial sync if online
    if (isOnline && window.supabaseClient) {
        setTimeout(async () => {
            await syncData();
            if (window.realtimeSync) {
                window.realtimeSync.initialize();
            }
        }, 1000);
    }
    
    // Hide loading
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);
});

// ================== UTILITY FUNCTIONS ==================
function updateDateTime() {
    const now = new Date();
    const dateOptions = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    
    document.querySelectorAll('.date-time').forEach(el => {
        el.textContent = now.toLocaleDateString('en-US', dateOptions) + ' | ' + 
                        now.toLocaleTimeString('en-US', timeOptions);
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    toast.style.background = colors[type] || colors.success;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ================== LOGIN FUNCTIONS ==================
function showLoginTab(tab) {
    document.querySelectorAll('.login-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.getElementById('staffLoginForm').style.display = tab === 'staff' ? 'block' : 'none';
    document.getElementById('clientLoginForm').style.display = tab === 'client' ? 'block' : 'none';
}

async function staffLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const role = document.getElementById('userRole').value;
    
    if (!username || !password) {
        showToast('Please enter username and password', 'error');
        return;
    }
    
    // Check local users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && 
        u.password === password && 
        u.role === role
    );
    
    if (user) {
        currentUser = {
            id: user.id,
            username: user.username,
            role: user.role,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await showApp();
        showToast(`Welcome ${user.role === 'admin' ? 'Administrator' : 'Cashier'}!`, 'success');
    } else {
        showToast('Invalid username or password', 'error');
    }
}

function clientLogin() {
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    const address = document.getElementById('clientAddress').value.trim();
    
    if (!name || !phone || !address) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    currentClient = {
        id: Date.now(),
        name: name,
        phone: phone,
        address: address,
        loginTime: new Date().toISOString()
    };
    
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    showClientInterface();
    showToast(`Welcome ${name}!`, 'success');
}

// ================== MAIN APP FUNCTIONS ==================
async function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('clientInterface').style.display = 'none';
    
    updateUIForUserRole();
    updateDashboard();
    loadSettings();
    calculateSaleTotal();
    
    // Initial data load
    loadRecentSales();
    loadCustomers();
    loadOrders();
}

function showClientInterface() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('clientInterface').style.display = 'block';
    
    document.getElementById('clientUserName').textContent = currentClient.name;
    document.getElementById('orderClientName').textContent = currentClient.name;
    document.getElementById('orderClientAddress').textContent = currentClient.address;
    
    loadClientOrders();
    calculateClientTotal();
}

function updateUIForUserRole() {
    if (!currentUser) return;
    
    document.getElementById('currentUserRole').textContent = currentUser.role.toUpperCase();
    document.getElementById('welcomeUser').textContent = currentUser.username;
    
    // Show/hide admin-only features
    if (currentUser.role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
}

// ================== NAVIGATION ==================
function showSection(sectionId) {
    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Load section-specific data
    switch(sectionId) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'sales':
            loadRecentSales();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'customers':
            loadCustomers();
            break;
        case 'reports':
            generateReport();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

function showClientSection(sectionId) {
    // Update tabs
    document.querySelectorAll('#clientInterface .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('#clientInterface .content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById('client' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1)).classList.add('active');
    
    // Load section-specific data
    if (sectionId === 'myorders') {
        loadClientOrders();
    }
}

// ================== DASHBOARD ==================
async function updateDashboard() {
    const today = new Date().toDateString();
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    
    // Calculate today's metrics
    const todaySales = sales.filter(sale => 
        new Date(sale.timestamp).toDateString() === today
    );
    const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.amount, 0);
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    
    // Update UI
    document.getElementById('todayRevenue').textContent = '₱' + todayRevenue.toFixed(2);
    document.getElementById('todaySales').textContent = todaySales.length;
    document.getElementById('totalCustomers').textContent = customers.length;
    document.getElementById('pendingOrders').textContent = pendingOrders;
    
    // Load recent activity
    loadRecentActivity();
}

function loadRecentActivity() {
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    
    const allActivity = [
        ...sales.slice(-5).map(sale => ({
            type: 'sale',
            message: `${sale.customer} - ₱${sale.amount}`,
            time: new Date(sale.timestamp).toLocaleTimeString()
        })),
        ...orders.slice(-5).map(order => ({
            type: 'order',
            message: `${order.clientName} - ${order.status}`,
            time: new Date(order.timestamp).toLocaleTimeString()
        }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time));
    
    const activityList = document.getElementById('recentActivity');
    if (!activityList) return;
    
    activityList.innerHTML = '';
    
    if (allActivity.length === 0) {
        activityList.innerHTML = '<div class="activity-item"><i class="fas fa-info-circle"></i><span>No recent activity</span></div>';
        return;
    }
    
    allActivity.slice(0, 5).forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <i class="fas fa-${activity.type === 'sale' ? 'dollar-sign' : 'shopping-cart'}"></i>
            <span>${activity.message}</span>
            <small>${activity.time}</small>
        `;
        activityList.appendChild(item);
    });
}

// ================== SALES FUNCTIONS ==================
function adjustSaleQuantity(change) {
    const input = document.getElementById('saleQuantity');
    let value = parseInt(input.value) + change;
    if (value < 1) value = 1;
    input.value = value;
    calculateSaleTotal();
}

function calculateSaleTotal() {
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 1;
    const customerType = document.getElementById('saleCustomerType').value;
    const containerSize = parseInt(document.getElementById('containerSize').value) || 5;
    
    let pricePerGallon;
    switch(customerType) {
        case 'regular': pricePerGallon = 15; break;
        case 'suki': pricePerGallon = 13.5; break;
        case 'bulk': pricePerGallon = 12; break;
        default: pricePerGallon = 15;
    }
    
    const total = pricePerGallon * quantity * containerSize;
    document.getElementById('saleTotal').textContent = total.toFixed(2);
    return total;
}

async function processSale() {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    const customerName = document.getElementById('saleCustomer').value.trim() || 'Walk-in';
    const customerType = document.getElementById('saleCustomerType').value;
    const containerSize = parseInt(document.getElementById('containerSize').value);
    const quantity = parseInt(document.getElementById('saleQuantity').value);
    const amount = calculateSaleTotal();
    
    const saleData = {
        customer_name: customerName,
        customer_type: customerType,
        container_size: containerSize,
        quantity: quantity,
        amount: amount,
        processed_by: currentUser.username,
        user_role: currentUser.role,
        device_id: window.DEVICE_ID
    };
    
    // Save locally first
    const sale = {
        id: Date.now(),
        cloud_id: null,
        customer: customerName,
        type: customerType,
        containerSize: containerSize,
        quantity: quantity,
        amount: amount,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        processedBy: currentUser.username,
        userRole: currentUser.role,
        device_id: window.DEVICE_ID,
        isRemote: false
    };
    
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    sales.push(sale);
    localStorage.setItem('sales', JSON.stringify(sales));
    
    // Try to sync with Supabase
    if (isOnline && window.supabaseClient) {
        try {
            const { data, error } = await window.supabaseClient
                .from('sales')
                .insert([saleData])
                .select();
            
            if (error) throw error;
            
            // Update local sale with cloud ID
            sale.cloud_id = data[0].id;
            localStorage.setItem('sales', JSON.stringify(sales));
            
            showToast('✅ Sale recorded and synced!', 'success');
            
        } catch (error) {
            console.error('Failed to sync sale:', error);
            // Add to sync queue
            addToSyncQueue('sales', saleData);
            showToast('💾 Sale saved locally (will sync later)', 'warning');
        }
    } else {
        // Offline mode
        addToSyncQueue('sales', saleData);
        showToast('💾 Sale saved locally (offline)', 'warning');
    }
    
    // Clear form and update UI
    document.getElementById('saleCustomer').value = '';
    document.getElementById('saleQuantity').value = 1;
    calculateSaleTotal();
    updateDashboard();
    loadRecentSales();
    
    // Update customer data
    updateCustomerAfterSale(customerName, customerType, amount);
}

function updateCustomerAfterSale(name, type, amount) {
    if (name === 'Walk-in') return;
    
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const existingCustomer = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    
    if (existingCustomer) {
        existingCustomer.totalSpent += amount;
        existingCustomer.purchaseCount += 1;
        existingCustomer.lastPurchase = new Date().toISOString();
        
        // Upgrade to suki if not already
        if (type === 'suki' && existingCustomer.type !== 'suki') {
            existingCustomer.type = 'suki';
        }
    } else {
        customers.push({
            id: Date.now(),
            name: name,
            phone: '',
            address: '',
            type: type,
            totalSpent: amount,
            purchaseCount: 1,
            lastPurchase: new Date().toISOString(),
            dateAdded: new Date().toISOString(),
            addedBy: currentUser?.username || 'system'
        });
    }
    
    localStorage.setItem('customers', JSON.stringify(customers));
    
    // Try to sync customer
    if (isOnline && window.supabaseClient) {
        const customerData = {
            name: name,
            type: type,
            total_spent: amount,
            purchase_count: 1
        };
        
        window.supabaseClient
            .from('customers')
            .upsert([customerData], { onConflict: 'name' })
            .catch(console.error);
    }
}

function loadRecentSales() {
    const today = new Date().toDateString();
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    const todaySales = sales.filter(sale => 
        new Date(sale.timestamp).toDateString() === today
    ).slice(-10).reverse();
    
    const tableBody = document.getElementById('todaySalesList');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (todaySales.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="empty">No sales today</td></tr>';
        return;
    }
    
    todaySales.forEach(sale => {
        const row = document.createElement('tr');
        const time = new Date(sale.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        row.innerHTML = `
            <td>${time}</td>
            <td>${sale.customer}</td>
            <td>${sale.quantity}</td>
            <td>₱${sale.amount.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

// ================== ORDERS MANAGEMENT ==================
function loadOrders() {
    const filter = document.getElementById('orderFilter').value;
    let orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    
    // Apply filter
    if (filter !== 'all') {
        orders = orders.filter(order => order.status === filter);
    }
    
    const tableBody = document.getElementById('ordersTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (orders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty">No orders found</td></tr>';
        return;
    }
    
    orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        const date = new Date(order.timestamp).toLocaleDateString();
        row.innerHTML = `
            <td>${order.id}</td>
            <td>${order.clientName}</td>
            <td>${order.quantity} × ${order.containerSize} Gallon</td>
            <td>₱${order.totalAmount.toFixed(2)}</td>
            <td><span class="order-status ${order.status}">${order.status}</span></td>
            <td>${date}</td>
            <td>
                <button class="action-btn edit" onclick="showUpdateOrderModal('${order.id}')">
                    <i class="fas fa-edit"></i> Update
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function filterOrders() {
    loadOrders();
}

function showUpdateOrderModal(orderId) {
    const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        showToast('Order not found', 'error');
        return;
    }
    
    document.getElementById('updateOrderId').value = orderId;
    document.getElementById('updateOrderClient').value = order.clientName;
    document.getElementById('updateOrderStatus').value = order.status;
    document.getElementById('updateDeliveryPerson').value = order.deliveryPerson || '';
    
    document.getElementById('updateOrderModal').classList.add('active');
}

async function saveOrderUpdate() {
    const orderId = document.getElementById('updateOrderId').value;
    const status = document.getElementById('updateOrderStatus').value;
    const deliveryPerson = document.getElementById('updateDeliveryPerson').value.trim();
    
    let orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    const index = orders.findIndex(o => o.id === orderId);
    
    if (index === -1) {
        showToast('Order not found', 'error');
        return;
    }
    
    orders[index].status = status;
    orders[index].deliveryPerson = deliveryPerson;
    if (status === 'delivered') {
        orders[index].fulfilled = true;
        orders[index].fulfillmentDate = new Date().toISOString();
    }
    
    localStorage.setItem('clientOrders', JSON.stringify(orders));
    
    // Try to sync with Supabase
    if (isOnline && window.supabaseClient) {
        try {
            await window.supabaseClient
                .from('client_orders')
                .update({ 
                    status: status,
                    delivery_person: deliveryPerson,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);
                
            showToast('✅ Order updated and synced!', 'success');
        } catch (error) {
            console.error('Failed to sync order update:', error);
        }
    }
    
    closeModal('updateOrderModal');
    loadOrders();
}

// ================== CUSTOMER MANAGEMENT ==================
function loadCustomers() {
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const tableBody = document.getElementById('customersTable');
    
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (customers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty">No customers yet</td></tr>';
        return;
    }
    
    customers.sort((a, b) => b.totalSpent - a.totalSpent);
    
    customers.forEach(customer => {
        const row = document.createElement('tr');
        const lastOrder = customer.lastPurchase ? 
            new Date(customer.lastPurchase).toLocaleDateString() : 'Never';
        row.innerHTML = `
            <td>${customer.name}</td>
            <td>${customer.phone || 'N/A'}</td>
            <td>${customer.address || 'N/A'}</td>
            <td><span class="customer-type ${customer.type}">${customer.type}</span></td>
            <td>₱${customer.totalSpent.toFixed(2)}</td>
            <td>${lastOrder}</td>
            <td>
                <button class="action-btn delete" onclick="deleteCustomer(${customer.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function searchCustomers() {
    const searchTerm = document.getElementById('customerSearch').value.toLowerCase();
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const tableBody = document.getElementById('customersTable');
    
    if (!tableBody) return;
    
    if (!searchTerm) {
        loadCustomers();
        return;
    }
    
    const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm) ||
        (customer.phone && customer.phone.includes(searchTerm)) ||
        (customer.address && customer.address.toLowerCase().includes(searchTerm))
    );
    
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty">No customers found</td></tr>';
        return;
    }
    
    filtered.forEach(customer => {
        const row = document.createElement('tr');
        const lastOrder = customer.lastPurchase ? 
            new Date(customer.lastPurchase).toLocaleDateString() : 'Never';
        row.innerHTML = `
            <td>${customer.name}</td>
            <td>${customer.phone || 'N/A'}</td>
            <td>${customer.address || 'N/A'}</td>
            <td><span class="customer-type ${customer.type}">${customer.type}</span></td>
            <td>₱${customer.totalSpent.toFixed(2)}</td>
            <td>${lastOrder}</td>
            <td>
                <button class="action-btn delete" onclick="deleteCustomer(${customer.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function showAddCustomerModal() {
    document.getElementById('addCustomerModal').classList.add('active');
}

async function saveNewCustomer() {
    const name = document.getElementById('newCustomerName').value.trim();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    const address = document.getElementById('newCustomerAddress').value.trim();
    const type = document.getElementById('newCustomerType').value;
    
    if (!name) {
        showToast('Please enter customer name', 'error');
        return;
    }
    
    const customerData = {
        name: name,
        phone: phone,
        address: address,
        type: type,
        total_spent: 0,
        purchase_count: 0,
        last_purchase: null
    };
    
    // Save locally
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    customers.push({
        id: Date.now(),
        name: name,
        phone: phone,
        address: address,
        type: type,
        totalSpent: 0,
        purchaseCount: 0,
        lastPurchase: null,
        dateAdded: new Date().toISOString()
    });
    localStorage.setItem('customers', JSON.stringify(customers));
    
    // Try to sync with Supabase
    if (isOnline && window.supabaseClient) {
        try {
            await window.supabaseClient
                .from('customers')
                .upsert([customerData], { onConflict: 'name' });
                
            showToast('✅ Customer added and synced!', 'success');
        } catch (error) {
            console.error('Failed to sync customer:', error);
            addToSyncQueue('customers', customerData);
            showToast('💾 Customer saved locally (will sync later)', 'warning');
        }
    } else {
        addToSyncQueue('customers', customerData);
        showToast('💾 Customer saved locally (offline)', 'warning');
    }
    
    closeModal('addCustomerModal');
    loadCustomers();
}

function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    customers = customers.filter(c => c.id != id);
    localStorage.setItem('customers', JSON.stringify(customers));
    loadCustomers();
    showToast('Customer deleted', 'success');
}

// ================== REPORTS ==================
function generateReport() {
    const period = document.getElementById('reportPeriod').value;
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    
    let filteredSales = sales;
    const now = new Date();
    
    switch(period) {
        case 'today':
            filteredSales = sales.filter(s => 
                new Date(s.timestamp).toDateString() === now.toDateString()
            );
            break;
        case 'week':
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filteredSales = sales.filter(s => new Date(s.timestamp) >= weekAgo);
            break;
        case 'month':
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filteredSales = sales.filter(s => new Date(s.timestamp) >= monthAgo);
            break;
        case 'year':
            const yearAgo = new Date(now);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            filteredSales = sales.filter(s => new Date(s.timestamp) >= yearAgo);
            break;
        // 'all' uses all sales
    }
    
    // Update report table
    const tableBody = document.getElementById('reportTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (filteredSales.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty">No data for selected period</td></tr>';
        updateReportSummary([]);
        return;
    }
    
    filteredSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    filteredSales.forEach(sale => {
        const row = document.createElement('tr');
        const date = new Date(sale.timestamp).toLocaleDateString();
        row.innerHTML = `
            <td>${date}</td>
            <td>${sale.customer}</td>
            <td>${sale.type}</td>
            <td>${sale.quantity}</td>
            <td>₱${sale.amount.toFixed(2)}</td>
            <td>${sale.processedBy || 'N/A'}</td>
        `;
        tableBody.appendChild(row);
    });
    
    updateReportSummary(filteredSales);
}

function updateReportSummary(sales) {
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.amount, 0);
    const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0;
    
    document.getElementById('reportTotalSales').textContent = totalSales;
    document.getElementById('reportTotalRevenue').textContent = '₱' + totalRevenue.toFixed(2);
    document.getElementById('reportAvgSale').textContent = '₱' + avgSale.toFixed(2);
}

function exportReport(format) {
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    
    if (sales.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    
    let content, filename, mimeType;
    
    if (format === 'csv') {
        let csv = 'Date,Customer,Type,Quantity,Amount,Processed By\n';
        sales.forEach(sale => {
            const date = new Date(sale.timestamp).toLocaleDateString();
            csv += `"${date}","${sale.customer}","${sale.type}",${sale.quantity},${sale.amount},"${sale.processedBy || 'N/A'}"\n`;
        });
        content = csv;
        filename = `sales_report_${new Date().toISOString().slice(0,10)}.csv`;
        mimeType = 'text/csv';
    } else if (format === 'pdf') {
        // Simple PDF generation using print
        window.print();
        return;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Report exported successfully', 'success');
}

function printReport() {
    window.print();
}

// ================== SETTINGS ==================
function loadSettings() {
    const storeName = localStorage.getItem('storeName') || 'PureFlow Water Station';
    const regularPrice = localStorage.getItem('regularPrice') || '15';
    const sukiDiscount = localStorage.getItem('sukiDiscount') || '10';
    const bulkDiscount = localStorage.getItem('bulkDiscount') || '20';
    
    document.getElementById('settingStoreName').value = storeName;
    document.getElementById('storeTitle').textContent = storeName;
    document.getElementById('settingRegularPrice').value = regularPrice;
    document.getElementById('settingSukiDiscount').value = sukiDiscount;
    document.getElementById('settingBulkDiscount').value = bulkDiscount;
}

async function saveSettings() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can change settings', 'error');
        return;
    }
    
    const storeName = document.getElementById('settingStoreName').value.trim();
    const regularPrice = document.getElementById('settingRegularPrice').value;
    const sukiDiscount = document.getElementById('settingSukiDiscount').value;
    const bulkDiscount = document.getElementById('settingBulkDiscount').value;
    
    // Save locally
    localStorage.setItem('storeName', storeName);
    localStorage.setItem('regularPrice', regularPrice);
    localStorage.setItem('sukiDiscount', sukiDiscount);
    localStorage.setItem('bulkDiscount', bulkDiscount);
    
    document.getElementById('storeTitle').textContent = storeName;
    
    // Try to sync with Supabase
    if (isOnline && window.supabaseClient) {
        const settingsData = {
            id: 'store_settings',
            store_name: storeName,
            regular_price: parseFloat(regularPrice),
            suki_discount: parseFloat(sukiDiscount),
            bulk_discount: parseFloat(bulkDiscount),
            updated_at: new Date().toISOString()
        };
        
        try {
            await window.supabaseClient
                .from('settings')
                .upsert([settingsData], { onConflict: 'id' });
                
            showToast('✅ Settings saved and synced!', 'success');
        } catch (error) {
            console.error('Failed to sync settings:', error);
            showToast('Settings saved locally', 'warning');
        }
    } else {
        showToast('Settings saved locally (offline)', 'warning');
    }
}

// ================== CLIENT FUNCTIONS ==================
function adjustClientQuantity(change) {
    const input = document.getElementById('clientOrderQuantity');
    let value = parseInt(input.value) + change;
    if (value < 1) value = 1;
    input.value = value;
    calculateClientTotal();
}

function calculateClientTotal() {
    const quantity = parseInt(document.getElementById('clientOrderQuantity').value) || 1;
    const containerSize = parseInt(document.getElementById('clientContainerSize').value);
    
    let pricePerGallon;
    switch(containerSize) {
        case 5: pricePerGallon = 15; break;
        case 3: pricePerGallon = 10; break;
        case 1: pricePerGallon = 5; break;
        default: pricePerGallon = 15;
    }
    
    let total = pricePerGallon * quantity;
    
    // Apply bulk discount
    if (quantity >= 10) {
        total *= 0.9; // 10% discount
    }
    
    document.getElementById('clientOrderTotal').textContent = total.toFixed(2);
    return total;
}

async function submitClientOrder() {
    if (!currentClient) {
        showToast('Please login first', 'error');
        return;
    }
    
    const containerSize = parseInt(document.getElementById('clientContainerSize').value);
    const quantity = parseInt(document.getElementById('clientOrderQuantity').value);
    const total = calculateClientTotal();
    const orderId = 'ORD' + Date.now().toString().slice(-6);
    
    const orderData = {
        id: orderId,
        client_name: currentClient.name,
        client_phone: currentClient.phone,
        client_address: currentClient.address,
        container_size: containerSize,
        quantity: quantity,
        total_amount: total,
        status: 'pending'
    };
    
    // Save locally
    const order = {
        id: orderId,
        clientName: currentClient.name,
        clientPhone: currentClient.phone,
        clientAddress: currentClient.address,
        containerSize: containerSize,
        quantity: quantity,
        totalAmount: total,
        status: 'pending',
        orderDate: new Date().toISOString(),
        timestamp: Date.now(),
        isRemote: false
    };
    
    const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    orders.push(order);
    localStorage.setItem('clientOrders', JSON.stringify(orders));
    
    // Try to sync with Supabase
    if (isOnline && window.supabaseClient) {
        try {
            await window.supabaseClient
                .from('client_orders')
                .insert([orderData]);
                
            showToast('✅ Order submitted and synced!', 'success');
        } catch (error) {
            console.error('Failed to sync order:', error);
            addToSyncQueue('client_orders', orderData);
            showToast('💾 Order saved locally (will sync later)', 'warning');
        }
    } else {
        addToSyncQueue('client_orders', orderData);
        showToast('💾 Order saved locally (offline)', 'warning');
    }
    
    // Reset form
    document.getElementById('clientOrderQuantity').value = 1;
    calculateClientTotal();
    loadClientOrders();
}

function loadClientOrders() {
    if (!currentClient) return;
    
    const orders = JSON.parse(localStorage.getItem('clientOrders') || '[]');
    const clientOrders = orders.filter(order => 
        order.clientName === currentClient.name
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const tableBody = document.getElementById('clientOrdersTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (clientOrders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty">No orders yet</td></tr>';
        return;
    }
    
    clientOrders.forEach(order => {
        const row = document.createElement('tr');
        const date = new Date(order.timestamp).toLocaleDateString();
        row.innerHTML = `
            <td>${order.id}</td>
            <td>${date}</td>
            <td>${order.quantity} × ${order.containerSize} Gallon</td>
            <td>₱${order.totalAmount.toFixed(2)}</td>
            <td><span class="order-status ${order.status}">${order.status}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

function updateClientProfile() {
    const name = document.getElementById('clientProfileName').value.trim();
    const phone = document.getElementById('clientProfilePhone').value.trim();
    const address = document.getElementById('clientProfileAddress').value.trim();
    
    if (!name || !phone || !address) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    currentClient.name = name;
    currentClient.phone = phone;
    currentClient.address = address;
    
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    
    showToast('Profile updated', 'success');
}

// ================== DATA MANAGEMENT ==================
function backupData() {
    const backup = {
        sales: JSON.parse(localStorage.getItem('sales') || '[]'),
        customers: JSON.parse(localStorage.getItem('customers') || '[]'),
        clientOrders: JSON.parse(localStorage.getItem('clientOrders') || '[]'),
        users: JSON.parse(localStorage.getItem('users') || '[]'),
        settings: {
            storeName: localStorage.getItem('storeName'),
            regularPrice: localStorage.getItem('regularPrice'),
            sukiDiscount: localStorage.getItem('sukiDiscount'),
            bulkDiscount: localStorage.getItem('bulkDiscount')
        },
        timestamp: new Date().toISOString(),
        backedUpBy: currentUser?.username || 'system'
    };
    
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pureflow_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Backup downloaded', 'success');
}

function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = function(event) {
            try {
                const backup = JSON.parse(event.target.result);
                
                if (confirm('This will replace all current data. Continue?')) {
                    if (backup.sales) localStorage.setItem('sales', JSON.stringify(backup.sales));
                    if (backup.customers) localStorage.setItem('customers', JSON.stringify(backup.customers));
                    if (backup.clientOrders) localStorage.setItem('clientOrders', JSON.stringify(backup.clientOrders));
                    if (backup.users) localStorage.setItem('users', JSON.stringify(backup.users));
                    if (backup.settings) {
                        Object.keys(backup.settings).forEach(key => {
                            if (backup.settings[key]) {
                                localStorage.setItem(key, backup.settings[key]);
                            }
                        });
                    }
                    
                    showToast('Data restored successfully', 'success');
                    location.reload();
                }
            } catch (error) {
                showToast('Invalid backup file', 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

function clearLocalData() {
    if (!confirm('This will clear ALL local data. Are you sure?')) return;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const settings = {
        storeName: localStorage.getItem('storeName'),
        regularPrice: localStorage.getItem('regularPrice'),
        sukiDiscount: localStorage.getItem('sukiDiscount'),
        bulkDiscount: localStorage.getItem('bulkDiscount')
    };
    
    localStorage.clear();
    currentUser = null;
    currentClient = null;
    
    // Restore essential data
    localStorage.setItem('users', JSON.stringify(users));
    Object.keys(settings).forEach(key => {
        if (settings[key]) localStorage.setItem(key, settings[key]);
    });
    
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('clientInterface').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    
    showToast('Local data cleared', 'success');
    initializeSampleData();
}

// ================== SYNC FUNCTIONS ==================
function addToSyncQueue(table, data) {
    syncQueue.push({
        table: table,
        data: data,
        timestamp: Date.now(),
        deviceId: window.DEVICE_ID,
        synced: false
    });
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
}

async function syncData() {
    if (!isOnline || !window.supabaseClient) return;
    
    try {
        // Sync queued items
        for (let i = syncQueue.length - 1; i >= 0; i--) {
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
                            .upsert([item.data], { onConflict: 'name' });
                        break;
                    case 'client_orders':
                        result = await window.supabaseClient
                            .from('client_orders')
                            .upsert([item.data], { onConflict: 'id' });
                        break;
                }
                
                if (result && !result.error) {
                    syncQueue.splice(i, 1);
                }
            } catch (error) {
                console.error('Failed to sync item:', item, error);
            }
        }
        
        localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
        
        // Pull latest data from Supabase
        await pullLatestData();
        
        updateSyncStatus();
        showToast('✅ Sync completed', 'success');
        
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

async function pullLatestData() {
    if (!isOnline || !window.supabaseClient) return;
    
    try {
        // Pull sales
        const { data: sales } = await window.supabaseClient
            .from('sales')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (sales) {
            localStorage.setItem('sales', JSON.stringify(sales.map(s => ({
                id: s.id,
                cloud_id: s.id,
                customer: s.customer_name,
                type: s.customer_type,
                quantity: s.quantity,
                amount: s.amount,
                date: s.created_at,
                timestamp: new Date(s.created_at).getTime(),
                processedBy: s.processed_by,
                userRole: s.user_role,
                device_id: s.device_id,
                isRemote: s.device_id !== window.DEVICE_ID
            }))));
        }
        
        // Pull orders
        const { data: orders } = await window.supabaseClient
            .from('client_orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (orders) {
            localStorage.setItem('clientOrders', JSON.stringify(orders.map(o => ({
                id: o.id,
                clientName: o.client_name,
                clientPhone: o.client_phone,
                clientAddress: o.client_address,
                containerSize: o.container_size,
                quantity: o.quantity,
                totalAmount: o.total_amount,
                status: o.status,
                orderDate: o.created_at,
                timestamp: new Date(o.created_at).getTime(),
                isRemote: true
            }))));
        }
        
        // Pull customers
        const { data: customers } = await window.supabaseClient
            .from('customers')
            .select('*');
        
        if (customers) {
            localStorage.setItem('customers', JSON.stringify(customers.map(c => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                address: c.address,
                type: c.type,
                totalSpent: c.total_spent,
                purchaseCount: c.purchase_count,
                lastPurchase: c.last_purchase
            }))));
        }
        
    } catch (error) {
        console.error('Failed to pull data:', error);
    }
}

function forceSync() {
    if (!isOnline) {
        showToast('You are offline', 'error');
        return;
    }
    syncData();
}

function updateSyncStatus() {
    const pendingCount = syncQueue.length;
    document.getElementById('pendingSyncCount').textContent = `${pendingCount} items`;
    document.getElementById('lastSyncTime').textContent = new Date().toLocaleTimeString();
    document.getElementById('syncStatusInfo').textContent = isOnline ? 'Online' : 'Offline';
}

// ================== EVENT HANDLERS ==================
function handleOnline() {
    isOnline = true;
    document.getElementById('syncStatus').textContent = 'Online';
    document.getElementById('syncIcon').className = 'fas fa-wifi';
    document.getElementById('syncIcon').style.color = '#28a745';
    
    if (window.supabaseClient) {
        syncData();
        if (window.realtimeSync) {
            window.realtimeSync.initialize();
        }
    }
}

function handleOffline() {
    isOnline = false;
    document.getElementById('syncStatus').textContent = 'Offline';
    document.getElementById('syncIcon').className = 'fas fa-wifi-slash';
    document.getElementById('syncIcon').style.color = '#dc3545';
}

function setupEventListeners() {
    // Customer autocomplete
    const customerInput = document.getElementById('saleCustomer');
    if (customerInput) {
        customerInput.addEventListener('input', function() {
            const customers = JSON.parse(localStorage.getItem('customers') || '[]');
            const datalist = document.getElementById('customerList');
            datalist.innerHTML = '';
            
            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.name;
                datalist.appendChild(option);
            });
        });
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        localStorage.removeItem('currentUser');
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        showToast('Logged out', 'success');
    }
}

function clientLogout() {
    if (confirm('Are you sure you want to logout?')) {
        currentClient = null;
        localStorage.removeItem('currentClient');
        document.getElementById('clientInterface').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        showToast('Logged out', 'success');
    }
}

// ================== INITIALIZATION ==================
function initializeSampleData() {
    // Initialize users if empty
    if (!localStorage.getItem('users') || JSON.parse(localStorage.getItem('users')).length === 0) {
        const users = [
            {
                id: 1,
                username: 'admin',
                password: 'admin123',
                role: 'admin',
                isActive: true
            },
            {
                id: 2,
                username: 'cashier',
                password: 'cashier123',
                role: 'cashier',
                isActive: true
            }
        ];
        localStorage.setItem('users', JSON.stringify(users));
    }
    
    // Initialize settings if empty
    if (!localStorage.getItem('storeName')) {
        localStorage.setItem('storeName', 'PureFlow Water Station');
        localStorage.setItem('regularPrice', '15');
        localStorage.setItem('sukiDiscount', '10');
        localStorage.setItem('bulkDiscount', '20');
    }
}
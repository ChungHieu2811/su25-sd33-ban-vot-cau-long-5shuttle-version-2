import React, { useEffect, useState, useMemo } from 'react';
import { CheckCircle, Clock, Package, Truck, CreditCard, XCircle, RotateCcw, AlertCircle } from 'lucide-react';
import { Plus, Minus, ShoppingCart, Star, Heart } from 'lucide-react';
import { Calculator, Percent, Receipt } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { X, Banknote, User, Calendar, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';
import PaymentModal from './PaymentModal';
import OrderInfo from './OrderInfor';
import OrderProgress from './OrderProgress';
import ProductList from './ProductList';
import PaymentDetails from './PaymentDetai';
import KhoHangManagement from '../../../components/KhoHangManagement';
import DeliveryIncidentModal from '../../../components/admin/DeliveryIncidentModal';
import DeliveryIncidentList from '../../../components/admin/DeliveryIncidentList';
import swal from 'sweetalert';
import { toast } from 'react-toastify';
import axios from 'axios';
import ProductModal from '../Sale/ProductModal';
import SockJS from 'sockjs-client';
import { Stomp } from '@stomp/stompjs';
import { useAdminAuth } from '../../../contexts/adminAuthContext';

// Helper function to generate timeline with real order history data
const ORDER_STEPS = [1, 2, 3, 4, 5, 6];
const generateTimeline = (currentStatus, orderHistory = [], orderData = {}) => {
    const timeline = [];

    // Tạo map để lưu thời gian thực từ orderHistory theo trạng thái
    const historyTimeMap = {};
    if (orderHistory && orderHistory.length > 0) {
        orderHistory.forEach((history) => {
            if (history.trangThaiHoaDon && history.ngayTao) {
                // Chuyển đổi tên trạng thái thành số
                const statusNumber = getStatusNumberFromLabel(history.trangThaiHoaDon);
                if (statusNumber) {
                    historyTimeMap[statusNumber] = history.ngayTao;
                }
            }
        });
    }

    for (let i = 0; i < ORDER_STEPS.length; i++) {
        const step = ORDER_STEPS[i];
        let completed = currentStatus > step;
        let current = currentStatus === step;
        let time = 'Đang chờ...';

        if (historyTimeMap[step]) {
            // Sử dụng thời gian thực từ orderHistory nếu có
            time = new Date(historyTimeMap[step]).toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } else if (current) {
            // Hiển thị thời gian hiện tại cho trạng thái đang active
            time = new Date().toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } else if (completed) {
            // Cho các trạng thái đã hoàn thành nhưng không có trong history
            // Sử dụng thời gian tạo đơn hàng cho trạng thái 1 (Chờ xác nhận)
            if (step === 1 && orderData.ngayTao) {
                time = new Date(orderData.ngayTao).toLocaleString('vi-VN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                });
            } else {
                // Hiển thị "Đã hoàn thành" thay vì "Đang chờ..." cho các trạng thái completed khác
                time = 'Đã hoàn thành';
            }
        }

        timeline.push({
            status: step,
            time,
            completed,
            current,
        });
    }
    return timeline;
};

// Helper function để chuyển đổi tên trạng thái thành số
const getStatusNumberFromLabel = (label) => {
    const statusMap = {
        'Chờ xác nhận': 1,
        'Chờ giao hàng': 2,
        'Đang vận chuyển': 3,
        'Đã giao hàng': 4,
        'Đã thanh toán': 5,
        'Hoàn thành': 6,
        'Đã hủy': 7,
        'Trả hàng': 8,
        'Chờ nhập hàng': 9,
        'Có sự cố - Tạm dừng vận chuyển': 10,
    };
    return statusMap[label] || null;
};

function OrderStatus() {
    const location = useLocation();
    const { admin } = useAdminAuth(); // Lấy thông tin admin đang đăng nhập
    const orderData = useMemo(() => location.state?.order || {}, [location.state?.order]);
    const [orderDetailDatas, setOrderDetailDatas] = useState(location.state?.orderDetails || []);
    const [checkOut, setCheckOuts] = useState(location.state?.checkOut || []);
    const [currentOrderStatus, setCurrentOrderStatus] = useState(orderData.trangThai || 3);
    const [isOrderInTransit, setIsOrderInTransit] = useState(orderData.trangThai === 3);
    const [hoaDonId, setHoaDonId] = useState(orderData.id || null);
    const [returnHistory, setReturnHistory] = useState([]);
    const [preOrders, setPreOrders] = useState([]);
    const [quantity, setQuantity] = useState(1);
    const [isLiked, setIsLiked] = useState(false);
    const [discountCode, setDiscountCode] = useState('');
    const [discountPercent, setDiscountPercent] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customerMoney, setCustomerMoney] = useState(0);
    const [note, setNote] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [subtotal, setSubtotal] = useState(0);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [total, setTotal] = useState(0);
    // State để theo dõi tongTien hiện tại và cập nhật real-time
    const [currentTongTien, setCurrentTongTien] = useState(orderData.tongTien || 0);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importQuantity, setImportQuantity] = useState(1);
    const [selectedProductId, setSelectedProductId] = useState(null);
    const shippingFee = orderData.phiShip; // Sử dụng phí ship từ database, fallback về 30000 nếu không có
    const [stompClient, setStompClient] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [orderHistory, setOrderHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showIncidentModal, setShowIncidentModal] = useState(false);
    const [incidentRefreshTrigger, setIncidentRefreshTrigger] = useState(0);
    const [timeline, setTimeline] = useState([]);
    // State để theo dõi các sản phẩm hoàn hàng
    const [totalReturnAmount, setTotalReturnAmount] = useState(0);
    // Map đơn giá giao dịch lấy từ lịch sử hoàn hàng: hoaDonCTId -> donGia  
    const [returnPriceMap, setReturnPriceMap] = useState({});
    // Map of hoaDonChiTietId -> total returned quantity (approved returns)
    const [returnedQtyMap, setReturnedQtyMap] = useState({});

    const fetchPreOrders = async () => {
        try {
            const response = await axios.get(`http://localhost:8080/api/pre-order/hoa-don/${hoaDonId}`);
            setPreOrders(response.data);
        } catch (error) {
            console.error('Lỗi khi lấy danh sách đặt trước:', error);
            toast.error('Không thể lấy danh sách đặt trước!');
        }
    };

    const fetchBillDetails = async (idHoaDon) => {
        try {
            const response = await axios.get(`http://localhost:8080/api/hoa-don-ct/hoa-don/${idHoaDon}`);
            setOrderDetailDatas(response.data);
            return response.data;
        } catch (error) {
            console.error('Lỗi khi lấy chi tiết hóa đơn:', error);
            toast.error('Không thể lấy chi tiết hóa đơn!');
            return null;
        }
    };

    // Persist hoaDon.tongTien on server
    const persistHoaDonTotal = async (newTotal) => {
        if (!hoaDonId) return false;
        try {
            const hoaDonRes = await axios.get(`http://localhost:8080/api/hoa-don/${hoaDonId}`);
            const hoaDonObj = hoaDonRes.data || {};
            hoaDonObj.tongTien = newTotal;

            await axios.put(`http://localhost:8080/api/hoa-don/${hoaDonId}`, hoaDonObj, {
                headers: { 'Content-Type': 'application/json' },
            });

            // Cập nhật state tongTien ngay lập tức để UI phản ánh thay đổi
            setCurrentTongTien(newTotal);

            return true;
        } catch (err) {
            console.error('Không thể cập nhật tổng tiền hóa đơn trên server:', err);
            return false;
        }
    };

    const fetchOrderHistory = async () => {
        if (!hoaDonId) return;

        setLoadingHistory(true);
        try {
            const response = await axios.get(`http://localhost:8080/api/lich-su-don-hang/hoa-don/${hoaDonId}`);
            setOrderHistory(response.data);
        } catch (error) {
            console.error('Lỗi khi lấy lịch sử đơn hàng:', error);
            toast.error('Không thể lấy lịch sử đơn hàng!');
        } finally {
            setLoadingHistory(false);
        }
    };

    // Safe STOMP send helper (component scope) - can be used by all handlers
    const safeStompSend = (destination, headers = {}, body = '') => {
        try {
            const c = stompClient;
            if (!c) return false;

            const isConnected = !!c.connected || (c.ws && c.ws.readyState === 1);
            if (isConnected && typeof c.send === 'function') {
                c.send(destination, headers, body);
                return true;
            }
            console.warn('STOMP not connected, skipping send to', destination);
            return false;
        } catch (err) {
            console.warn('Error while sending STOMP message:', err);
            return false;
        }
    };

    const handleShowHistoryModal = () => {
        setShowHistoryModal(true);
        fetchOrderHistory();
    };

    const handleCloseHistoryModal = () => {
        setShowHistoryModal(false);
        setOrderHistory([]);
    };

    const handleOpenIncidentModal = () => {
        setShowIncidentModal(true);
    };

    const handleCloseIncidentModal = () => {
        setShowIncidentModal(false);
    };

    const handleIncidentReported = (newIncident) => {
        // Refresh incidents list by triggering re-fetch
        console.log('New incident reported:', newIncident);
        setIncidentRefreshTrigger((prev) => prev + 1);

        // Try to mark the order as "on hold" due to incident.
        // We'll use status code 10 for frontend-only "Có sự cố - Tạm dừng vận chuyển".
        // Attempt to update backend; if it fails, keep local state so UI is locked until handled.
        (async () => {
            const incidentSummary = `${newIncident.loaiSuCo || 'SU_CO'} (ID:${newIncident.id})`;
            try {
                // Try to update backend to a special incident status (10). Backend may reject unknown codes.
                const res = await fetch(`http://localhost:8080/api/hoa-don/${hoaDonId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(10),
                });

                if (res.ok) {
                    console.log('Backend accepted incident status 10');
                    setCurrentOrderStatus(10);
                    await saveOrderHistory(10, `Ghi nhận sự cố: ${incidentSummary} - ${newIncident.moTa || ''}`);
                } else {
                    console.warn('Backend rejected incident status 10, using local on-hold state');
                    // Keep local state: mark as on-hold so UI is locked and history recorded locally
                    setCurrentOrderStatus(10);
                    await saveOrderHistory(
                        10,
                        `Ghi nhận sự cố (local): ${incidentSummary} - ${newIncident.moTa || ''}`,
                    );
                }
            } catch (err) {
                console.warn('Error while trying to update order status for incident:', err);
                // Fallback to local on-hold state and save history
                setCurrentOrderStatus(10);
                try {
                    await saveOrderHistory(
                        10,
                        `Ghi nhận sự cố (local-error): ${incidentSummary} - ${newIncident.moTa || ''}`,
                    );
                } catch (err2) {
                    console.error('Failed saving order history after incident:', err2);
                }
            }

            // Send an internal notification via API (best-effort) and via STOMP topic for internal teams
            const internalNotification = {
                tieuDe: 'Sự cố vận chuyển nội bộ',
                noiDung: `Đơn #${orderData.ma} gặp sự cố: ${newIncident.loaiSuCo}. Xem chi tiết trong mục Sự cố vận chuyển.`,
                idRedirect: `/admin/hoa-don/${hoaDonId}`,
                kieuThongBao: 'warning',
                trangThai: 0,
                meta: { incidentId: newIncident.id, hoaDonId: hoaDonId },
            };

            try {
                // Best-effort POST; backend may accept generic notifications
                await axios.post('http://localhost:8080/api/thong-bao', internalNotification, {
                    headers: { 'Content-Type': 'application/json' },
                });
            } catch (err) {
                console.warn('Internal notification API failed (non-blocking):', err);
            }

            // Send STOMP message to an internal topic so connected services/users can react
            try {
                safeStompSend(
                    '/app/internal/incidents',
                    {},
                    JSON.stringify({ type: 'NEW_INCIDENT', data: internalNotification }),
                );
            } catch (err) {
                console.warn('STOMP internal incident send failed (non-blocking):', err);
            }
        })();
    };

    // Hàm để lưu lịch sử đơn hàng khi thay đổi trạng thái
    const saveOrderHistory = async (newStatus, description) => {
        if (!admin || !hoaDonId) return;

        try {
            // Lấy tên trạng thái để lưu vào TrangThaiHoaDon
            const statusLabel = getStatusLabel(newStatus)?.label || 'Không xác định';

            const params = new URLSearchParams({
                hoaDonId: hoaDonId.toString(),
                userId: admin.id.toString(),
                moTa: description || 'Thay đổi trạng thái đơn hàng',
                trangThaiHoaDon: statusLabel,
            });

            await axios.post(`http://localhost:8080/api/lich-su-don-hang/add-status-change?${params.toString()}`);
        } catch (error) {
            console.error('Lỗi khi lưu lịch sử đơn hàng:', error);
            // Không hiển thị lỗi cho user vì đây không phải là chức năng chính
        }
    };

    useEffect(() => {
        if (hoaDonId) {
            const fetchReturnHistory = async () => {
                try {
                    const response = await axios.get(`http://localhost:8080/api/hoan-hang/hoa-don/${hoaDonId}`);
                    if (response.data.success) {
                        setReturnHistory(response.data.data);
                        
                        // FIX: Xây dựng returnPriceMap để lấy đơn giá giao dịch chính xác
                        try {
                            const map = {};
                            const qtyMap = {};
                            response.data.data.forEach((r) => {
                                if (r.hoaDonChiTietId && r.donGia) {
                                    // Lấy đơn giá đầu tiên (tại thời điểm mua), các lần sau cùng 1 đơn giá
                                    if (!map[r.hoaDonChiTietId]) map[r.hoaDonChiTietId] = Number(r.donGia);
                                }
                                // Tính tổng số lượng đã hoàn cho mỗi chi tiết hóa đơn
                                if (r.hoaDonChiTietId && r.soLuongHoan) {
                                    const key = r.hoaDonChiTietId;
                                    qtyMap[key] = (qtyMap[key] || 0) + Number(r.soLuongHoan);
                                }
                            });
                            setReturnPriceMap(map);
                            setReturnedQtyMap(qtyMap);
                            console.log('Built returnPriceMap:', map);
                            console.log('Built returnedQtyMap:', qtyMap);
                        } catch (e) {
                            console.warn('Không thể build returnPriceMap:', e);
                        }
                    }
                } catch (error) {
                    console.error('Lỗi khi lấy lịch sử hoàn hàng:', error);
                    toast.error('Không thể lấy lịch sử hoàn hàng!');
                }
            };
            fetchReturnHistory();
            fetchPreOrders();

            // Kết nối WebSocket
            const socket = new SockJS('http://localhost:8080/ws');
            const client = Stomp.over(socket);
            client.connect({}, () => {
                client.subscribe(`/user/${orderData.taiKhoan?.id}/queue/notifications`, (message) => {
                    const notification = JSON.parse(message.body);
                    toast.info(notification.noiDung);
                    fetchPreOrders();
                    fetchBillDetails(hoaDonId);
                });
            });
            setStompClient(client);

            return () => {
                if (client) client.disconnect();
            };
        }
    }, [hoaDonId, orderData.taiKhoan?.id]);

    useEffect(() => {
        setIsOrderInTransit(currentOrderStatus === 3);
    }, [currentOrderStatus]);

    useEffect(() => {
        if (orderData.id) {
            setHoaDonId(orderData.id);
        }
    }, [orderData.id]);

    // Ensure we always refresh order details from server once hoaDonId is known (avoid stale location.state data)
    useEffect(() => {
        if (hoaDonId) {
            fetchBillDetails(hoaDonId);
        }
    }, [hoaDonId]);

    // Update timeline when orderHistory or currentOrderStatus changes
    useEffect(() => {
        const newTimeline = generateTimeline(currentOrderStatus, orderHistory, orderData);
        setTimeline(newTimeline);
    }, [orderHistory, currentOrderStatus, orderData]);

    // Discount validation logic (same as CheckOut.jsx)
    function validateDiscount(subtotal, voucher) {
        if (!voucher) return 0;
        if (subtotal < (voucher.dieuKienNhoNhat || 0)) return 0;
        
        let discountAmount;
        if (voucher.kieuGiaTri === 0) {
            // Giảm theo phần trăm
            discountAmount = (subtotal * (voucher.giaTri || 0)) / 100;
            if (voucher.giaTriMax && discountAmount > voucher.giaTriMax) {
                discountAmount = voucher.giaTriMax;
            }
        } else {
            // Giảm theo số tiền cố định
            discountAmount = voucher.giaTri || 0;
        }
        
        return discountAmount;
    }

    // Resolve possible price fields for an order detail item and return unit original/discounted prices
    const resolvePrices = (item) => {
        // Quantity: prefer item.soLuong; fallback to 1
        const qty = Number(item?.soLuong ?? item?.quantity ?? 1);

        // Unit price actually paid at purchase time (backend now stores unit price in hoaDonCT.giaBan)
        let unitDiscountedPrice = 0;
        if (item?.giaBan != null) {
            unitDiscountedPrice = Number(item.giaBan);
        } else if (item?.donGia != null) {
            unitDiscountedPrice = Number(item.donGia);
        } else if (item?.sanPhamCT?.donGia != null) {
            unitDiscountedPrice = Number(item.sanPhamCT.donGia);
        }

        // Try to infer original (pre-promo) unit price for display/strike-through
        let unitOriginalPrice = unitDiscountedPrice;
        if (item?.giaGoc != null) {
            unitOriginalPrice = Number(item.giaGoc);
        } else if (item?.sanPhamCT?.donGia != null) {
            unitOriginalPrice = Number(item.sanPhamCT.donGia);
        }

        // Clamp to 2 decimals
        const toMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
        unitDiscountedPrice = toMoney(unitDiscountedPrice);
        unitOriginalPrice = toMoney(unitOriginalPrice);

        // Compute line totals using unit price × quantity
        const lineDiscountedTotal = toMoney(unitDiscountedPrice * qty);
        const lineOriginalTotal = toMoney(unitOriginalPrice * qty);

        // Return new names and legacy aliases used elsewhere
        return {
            unitOriginalPrice,
            unitDiscountedPrice,
            lineOriginalTotal,
            lineDiscountedTotal,
            quantity: qty,
            // Aliases
            originalPrice: unitOriginalPrice,
            discountedPrice: unitDiscountedPrice,
            unitPrice: unitDiscountedPrice,
        };
    };

    useEffect(() => {
        try {
            const items = Array.isArray(orderDetailDatas) ? orderDetailDatas : [];

            // Subtotal from discounted unit prices (what customer actually pays before voucher + shipping)
            const subtotalCalc = items.reduce((sum, it) => {
                const { unitDiscountedPrice, quantity } = resolvePrices(it);
                return sum + unitDiscountedPrice * quantity;
            }, 0);

            // Voucher discount (if any)
            let voucherDiscount = 0;
            if (orderData?.voucher) {
                const result = validateDiscount(subtotalCalc, orderData?.voucher);
                voucherDiscount = Number(result) || 0;
            }

            // Returns: subtract totalReturnAmount if provided; state already maintained elsewhere
            const returnsAmount = Number(totalReturnAmount || 0);

            // Shipping fee from order or default 0
            const shipFee = Number(orderData?.phiShip || shippingFee || 0);

            const newSubtotal = Math.max(0, Math.round((Number(subtotalCalc) || 0) * 100) / 100);
            const newDiscountAmount = Math.min(newSubtotal, Math.round((Number(voucherDiscount) || 0) * 100) / 100);
            const newTotal = Math.max(0, Math.round((newSubtotal + shipFee - newDiscountAmount - returnsAmount) * 100) / 100);

            setSubtotal(newSubtotal);
            setDiscountAmount(newDiscountAmount);
            setTotal(newTotal);
            setCurrentTongTien(newTotal);
        } catch (e) {
            // Fallback: keep previous totals
            console.error('Total recompute failed', e);
        }
    }, [orderDetailDatas, orderData?.voucher, totalReturnAmount, orderData?.phiShip]);

    useEffect(() => {
        if (orderData.voucher) {
            setDiscountCode(orderData.voucher.ma);
            setDiscountPercent(orderData.voucher.giaTri);
        }
    }, [orderData]);

    // Đồng bộ currentTongTien với orderData.tongTien khi orderData thay đổi
    useEffect(() => {
        if (orderData.tongTien !== undefined && orderData.tongTien !== null) {
            setCurrentTongTien(orderData.tongTien);
        }
    }, [orderData.tongTien]);

    const handleConfirmAddProduct = async (selectedProduct, quantity) => {
        if (!selectedProduct || !orderData.id) {
            toast.error('Vui lòng chọn sản phẩm và hóa đơn!');
            return;
        }

        try {
            // Dùng API Enhanced để đảm bảo logic reservation/allocation theo trạng thái
            const response = await axios.post('http://localhost:8080/api/enhanced-kho-hang/add-product', {
                hoaDonId: orderData.id,
                sanPhamCTId: selectedProduct.id,
                quantity: quantity,
                reason: 'Admin thêm sản phẩm',
            });

            if (response.status === 200) {
                if (response.data?.trangThai === 9) {
                    swal({
                        title: 'Sản phẩm tạm hết hàng',
                        text: 'Sản phẩm này hiện không đủ hàng. Yêu cầu đặt trước đã được ghi nhận.',
                        icon: 'warning',
                        button: 'OK',
                    });
                    fetchPreOrders();
                } else {
                    toast.success('Thêm sản phẩm vào hóa đơn thành công!');
                }
                setShowProductModal(false);

                // Refresh details and recalc/persist total
                try {
                    const updatedDetails = await fetchBillDetails(orderData.id);
                    if (updatedDetails) {
                        const newSubtotal = updatedDetails.reduce((sum, item) => {
                            const { unitPrice } = resolvePrices(item);
                            const qty = Number(item.soLuong) || 0;
                            return sum + unitPrice * qty;
                        }, 0);
                        const newDiscountAmount = validateDiscount(newSubtotal, orderData.voucher);
                        const newTotal = newSubtotal - newDiscountAmount + (orderData.phiShip || 0);
                        const ok = await persistHoaDonTotal(newTotal);
                        if (!ok) {
                            toast.warning('Thêm sản phẩm thành công, nhưng không thể cập nhật tổng tiền trên server');
                        }
                    }
                } catch (err) {
                    console.error('Lỗi khi cập nhật tổng tiền sau khi thêm sản phẩm:', err);
                }
            }
        } catch (error) {
            console.error('Lỗi khi thêm sản phẩm:', error);
            if (error.response?.data === 'Sản phẩm tạm hết hàng. Đã tạo yêu cầu đặt trước.') {
                swal({
                    title: 'Sản phẩm tạm hết hàng',
                    text: 'Yêu cầu đặt trước đã được ghi nhận. Vui lòng nhập thêm hàng.',
                    icon: 'warning',
                    button: 'OK',
                });
                fetchPreOrders();
            } else {
                const msg = error.response?.data?.message || error.response?.data || 'Không thể thêm sản phẩm!';
                toast.error(msg);
            }
        }
    };

    const updateQuantity = async (orderDetailId, newQuantity) => {
        try {
            // SỬ DỤNG API MỚI: Enhanced KhoHangService
            const response = await fetch(
                `http://localhost:8080/api/enhanced-kho-hang/update-quantity/${orderDetailId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        soLuong: newQuantity,
                        reason: 'Admin điều chỉnh số lượng',
                    }),
                },
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Không thể cập nhật số lượng');
            }

            // Update local list with new quantity and line total (giaBan)
            const updatedOrderDetails = orderDetailDatas.map((item) => {
                if (item.id === orderDetailId) {
                    // Sử dụng resolvePrices để lấy đúng giá unit price (đã áp dụng khuyến mãi nếu có)
                    const { unitPrice } = resolvePrices(item);
                    return {
                        ...item,
                        soLuong: newQuantity,
                        // Keep giaBan as UNIT PRICE in client state as well
                        giaBan: unitPrice,
                    };
                }
                return item;
            });

            setOrderDetailDatas(updatedOrderDetails);

            // Recalculate invoice totals from updated details
            const newSubtotal = updatedOrderDetails.reduce((sum, item) => {
                // reuse resolvePrices to get unit discounted price
                const { unitPrice } = resolvePrices(item);
                const qty = Number(item.soLuong) || 0;
                return sum + unitPrice * qty;
            }, 0);

            const newDiscountAmount = validateDiscount(newSubtotal, orderData.voucher);
            const newTotal = newSubtotal - newDiscountAmount + (orderData.phiShip || 0);

            // Persist updated tongTien to backend HoaDon record
            try {
                const ok = await persistHoaDonTotal(newTotal);
                if (!ok) {
                    toast.warning('Cập nhật số lượng thành công, nhưng không thể cập nhật tổng tiền trên server');
                } else {
                    // Refresh bill details to keep client in sync (best-effort)
                    fetchBillDetails(hoaDonId);
                }
            } catch (err) {
                console.error('Không thể cập nhật tổng tiền hóa đơn trên server:', err);
                toast.warning('Stock allocation đã cập nhật, nhưng không thể cập nhật tổng tiền trên server');
            }

            toast.success('Cập nhật số lượng thành công!.');
        } catch (error) {
            console.error('Error updating quantity:', error);
            toast.error('Không thể cập nhật số lượng: ' + (error.message || 'Lỗi không xác định'));
        }
    };

    const handleQuantityChange = async (delta, orderDetailId) => {
        const currentItem = orderDetailDatas.find((item) => item.id === orderDetailId);
        const newQuantity = Math.max(1, currentItem.soLuong + delta);
        await updateQuantity(orderDetailId, newQuantity);
    };

    // Hàm để tăng số lượng sản phẩm từ ProductModal khi phát hiện trùng lặp
    const increaseProductQuantityFromModal = async (orderDetailId, delta = 1) => {
        const currentItem = orderDetailDatas.find((item) => item.id === orderDetailId);
        if (currentItem) {
            const newQuantity = currentItem.soLuong + delta;
            await updateQuantity(orderDetailId, newQuantity);
            setShowProductModal(false); // Đóng modal sau khi tăng số lượng
            return Promise.resolve(); // Đảm bảo return Promise
        }
        return Promise.resolve();
    };

    // Đặt hàm vào window object để ProductModal có thể gọi
    useEffect(() => {
        window.increaseProductQuantity = increaseProductQuantityFromModal;
        return () => {
            delete window.increaseProductQuantity;
        };
    }, [orderDetailDatas]);

    const handleDeleteProduct = async (orderDetailId) => {
        const currentItem = orderDetailDatas.find((item) => item.id === orderDetailId);

        if (!currentItem) {
            toast.error('Không tìm thấy sản phẩm!');
            return;
        }

        const isConfirmed = await swal({
            title: 'Xác nhận xóa sản phẩm',
            text: `Bạn có chắc chắn muốn xóa sản phẩm "${currentItem.sanPhamCT.ten}" khỏi đơn hàng?`,
            icon: 'warning',
            buttons: ['Hủy', 'Xóa'],
            dangerMode: true,
        });

        if (isConfirmed) {
            try {
                // Dùng API Enhanced để đảm bảo chỉ hoàn kho khi đã allocated
                const response = await axios.delete(
                    `http://localhost:8080/api/enhanced-kho-hang/remove-product/${orderDetailId}`,
                    { params: { reason: 'Admin xóa sản phẩm' } },
                );

                if (response.status === 200) {
                    // Cập nhật danh sách sản phẩm
                    const updatedOrderDetails = orderDetailDatas.filter((item) => item.id !== orderDetailId);
                    setOrderDetailDatas(updatedOrderDetails);

                    // Recalc and persist HoaDon.tongTien
                    try {
                        const updatedDetails = await fetchBillDetails(hoaDonId);
                        if (updatedDetails) {
                            const newSubtotal = updatedDetails.reduce((sum, item) => {
                                const { unitPrice } = resolvePrices(item);
                                const qty = Number(item.soLuong) || 0;
                                return sum + unitPrice * qty;
                            }, 0);
                            const newDiscountAmount = validateDiscount(newSubtotal, orderData.voucher);
                            const newTotal = newSubtotal - newDiscountAmount + (orderData.phiShip || 0);
                            const ok = await persistHoaDonTotal(newTotal);
                            if (!ok) {
                                toast.warning(
                                    'Xóa sản phẩm thành công, nhưng không thể cập nhật tổng tiền trên server',
                                );
                            }
                        }
                    } catch (err) {
                        console.error('Lỗi khi cập nhật tổng tiền sau khi xóa sản phẩm:', err);
                    }

                    // Lưu lịch sử đơn hàng
                    await saveOrderHistory(
                        currentOrderStatus,
                        `Xóa sản phẩm "${currentItem.sanPhamCT.ten}" khỏi đơn hàng`,
                    );

                    toast.success('Xóa sản phẩm thành công!');
                } else {
                    throw new Error('Không thể xóa sản phẩm');
                }
            } catch (error) {
                console.error('Lỗi khi xóa sản phẩm:', error);
                toast.error(error.response?.data || 'Không thể xóa sản phẩm!');
            }
        }
    };

    const handleOpenProductModal = () => {
        setShowProductModal(true);
    };

    const handleCloseProductModal = () => {
        setShowProductModal(false);
    };

    const handleOpenImportModal = (productId) => {
        setSelectedProductId(productId);
        setImportQuantity(1);
        setShowImportModal(true);
    };

    const handleCloseImportModal = () => {
        setShowImportModal(false);
        setSelectedProductId(null);
        setImportQuantity(1);
    };

    const handleConfirmImport = async () => {
        if (importQuantity <= 0) {
            toast.error('Số lượng nhập hàng phải lớn hơn 0!');
            return;
        }
        try {
            await axios.post('http://localhost:8080/api/hoa-don/import-stock', {
                sanPhamCTId: selectedProductId,
                quantity: importQuantity,
            });
            // Gửi thông báo đến người dùng khi nhập hàng thành công
            const userNotification = {
                khachHang: {
                    id: orderData.taiKhoan.id,
                },
                tieuDe: 'Cập nhật trạng thái nhập hàng',
                noiDung: `Sản phẩm trong đơn hàng #${hoaDonId} đã được nhập hàng. Vui lòng kiểm tra đơn hàng.`,
                idRedirect: `/user/hoa-don/${hoaDonId}`,
                kieuThongBao: 'success',
                trangThai: 0,
            };
            try {
                await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                    headers: { 'Content-Type': 'application/json' },
                });
                safeStompSend(
                    `/app/user/${orderData.taiKhoan?.id}/notifications`,
                    {},
                    JSON.stringify(userNotification),
                );
            } catch (notificationError) {
                console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                toast.warning('Không thể gửi thông báo đến người dùng.');
            }
            toast.success('Nhập hàng thành công!');
            fetchBillDetails(hoaDonId);
            fetchPreOrders();
            handleCloseImportModal();
        } catch (error) {
            console.error('Lỗi khi nhập hàng:', error);
            toast.error(error.response?.data || 'Không thể nhập hàng!');
        }
    };

    // Hàm xử lý khi có sản phẩm hoàn hàng
    const handleReturnSuccess = (returnItem) => {
        console.log('handleReturnSuccess called with:', returnItem);
        
        let updatedOrderDetails;
        
        // THÊM: Cập nhật orderDetailDatas từ updatedOrderDetails nếu có
        if (returnItem.updatedOrderDetails) {
            updatedOrderDetails = returnItem.updatedOrderDetails;
            setOrderDetailDatas(updatedOrderDetails);
        } else {
            // Fallback: cập nhật số lượng sản phẩm trong orderDetailDatas (logic cũ)
            if (returnItem.orderDetailId) {
                setOrderDetailDatas(prevItems => {
                    const updated = prevItems.map(item => {
                        if (item.id === returnItem.orderDetailId) {
                            const newSoLuong = Math.max(0, item.soLuong - returnItem.quantity);
                            return {
                                ...item,
                                soLuong: newSoLuong
                            };
                        }
                        return item;
                    });
                    updatedOrderDetails = updated;
                    return updated;
                });
            }
        }
        
        // FIX: Recalculate voucher discount properly after returns
        if (updatedOrderDetails) {
            // Calculate new subtotal based on updated order details
            const newSubtotal = updatedOrderDetails.reduce((sum, item) => {
                const { unitPrice } = resolvePrices(item);
                const qty = Number(item.soLuong) || 0;
                return sum + unitPrice * qty;
            }, 0);
            
            // Recalculate discount amount using voucher constraints
            const voucher = orderData.voucher || null;
            const newDiscountAmount = validateDiscount(newSubtotal, voucher);
            const correctedTotal = newSubtotal - newDiscountAmount + shippingFee;
            
            // Update all related states with corrected values
            setSubtotal(newSubtotal);
            setDiscountAmount(newDiscountAmount);
            setTotal(correctedTotal);
            setCurrentTongTien(correctedTotal);
            
            // Persist the corrected total to backend
            persistHoaDonTotal(correctedTotal);
            
            console.log('Return success - recalculated:', {
                newSubtotal,
                voucher: voucher?.ma,
                originalDiscount: returnItem.updatedOrderTotal ? 'backend provided' : 'none',
                newDiscountAmount,
                correctedTotal
            });
        } else {
            // Fallback to backend total if no order details update
            if (returnItem.updatedOrderTotal !== undefined) {
                setCurrentTongTien(returnItem.updatedOrderTotal);
                setTotal(returnItem.updatedOrderTotal);
            } else {
                const newTotal = currentTongTien - returnItem.totalAmount;
                setCurrentTongTien(newTotal);
                setTotal(newTotal);
            }
        }
        
        // Cập nhật tổng tiền hoàn hàng
        if (returnItem.totalReturnAmount !== undefined) {
            console.log('Setting totalReturnAmount to:', returnItem.totalReturnAmount);
            setTotalReturnAmount(returnItem.totalReturnAmount);
        } else {
            // Fallback: cộng dồn cục bộ
            console.log('Using fallback totalReturnAmount calculation');
            setTotalReturnAmount(prev => prev + returnItem.totalAmount);
        }
        
        toast.success(`Đã hoàn ${returnItem.quantity} sản phẩm. Đơn hàng và tồn kho đã được cập nhật trực tiếp.`);
    };

    const handleUpdateDeliveryInfo = async (deliveryInfo) => {
        try {
            const response = await axios.put(
                `http://localhost:8080/api/hoa-don/${orderData.id}/delivery-info`,
                deliveryInfo,
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            );

            if (response.status === 200) {
                // Cập nhật orderData với thông tin mới
                Object.assign(orderData, deliveryInfo);

                // Nếu có phí ship mới, cập nhật lại subtotal và total
                if (deliveryInfo.phiShip !== undefined) {
                    // Trigger recalculation của subtotal và total
                    fetchBillDetails(orderData.id);
                }

                toast.success('Cập nhật thông tin người nhận thành công!');
            }
        } catch (error) {
            console.error('Lỗi khi cập nhật thông tin giao hàng:', error);
            toast.error(error.response?.data || 'Không thể cập nhật thông tin giao hàng!');
            throw error; // Re-throw để OrderInfo có thể handle
        }
    };

    const getStatusLabel = (status) => {
        // Xử lý cả trạng thái dạng số và dạng chuỗi
        if (typeof status === 'string') {
            // Nếu là chuỗi, tìm theo label
            switch (status.toLowerCase()) {
                case 'chờ xác nhận':
                    return { label: 'Chờ xác nhận', color: 'bg-yellow-200 text-yellow-800' };
                case 'chờ giao hàng':
                    return { label: 'Chờ giao hàng', color: 'bg-blue-200 text-blue-800' };
                case 'đang vận chuyển':
                    return { label: 'Đang vận chuyển', color: 'bg-purple-200 text-purple-800' };
                case 'đã giao hàng':
                    return { label: 'Đã giao hàng', color: 'bg-gray-200 text-green-800' };
                case 'đã thanh toán':
                    return { label: 'Đã thanh toán', color: 'bg-teal-200 text-teal-800' };
                case 'hoàn thành':
                    return { label: 'Hoàn thành', color: 'bg-pink-200 text-gray-800' };
                case 'đã hủy':
                    return { label: 'Đã hủy', color: 'bg-red-200 text-red-800' };
                case 'trả hàng':
                    return { label: 'Trả hàng', color: 'bg-red-400 text-white' };
                case 'chờ nhập hàng':
                    return { label: 'Chờ nhập hàng', color: 'bg-orange-200 text-orange-800' };
                default:
                    return { label: status, color: 'bg-gray-200 text-gray-800' };
            }
        }

        // Xử lý trạng thái dạng số
        switch (status) {
            case 1:
                return { label: 'Chờ xác nhận', color: 'bg-yellow-200 text-yellow-800' };
            case 2:
                return { label: 'Chờ giao hàng', color: 'bg-blue-200 text-blue-800' };
            case 3:
                return { label: 'Đang vận chuyển', color: 'bg-purple-200 text-purple-800' };
            case 4:
                return { label: 'Đã giao hàng', color: 'bg-gray-200 text-green-800' };
            case 5:
                return { label: 'Đã thanh toán', color: 'bg-teal-200 text-teal-800' };
            case 6:
                return { label: 'Hoàn thành', color: 'bg-pink-200 text-gray-800' };
            case 7:
                return { label: 'Đã hủy', color: 'bg-red-200 text-red-800' };
            case 8:
                return { label: 'Trả hàng', color: 'bg-red-400 text-white' };
            case 9:
                return { label: 'Chờ nhập hàng', color: 'bg-orange-200 text-orange-800' };
            case 10:
                return { label: 'Có sự cố - Tạm dừng vận chuyển', color: 'bg-yellow-100 text-yellow-800' };
            default:
                return { label: 'Không xác định', color: 'bg-gray-200 text-gray-800' };
        }
    };

    const getStatusInfo = (status) => {
        switch (status) {
            case 1:
                return { label: 'Chờ xác nhận', color: '#ebd534', icon: Clock };
            case 2:
                return { label: 'Chờ giao hàng', color: '#34e5eb', icon: Package };
            case 3:
                return { label: 'Đang vận chuyển', color: '#345feb', icon: Truck };
            case 4:
                return { label: 'Đã giao hàng', color: '#e342f5', icon: CheckCircle };
            case 5:
                return { label: 'Đã thanh toán', color: '#42f5e0', icon: CreditCard };
            case 6:
                return { label: 'Hoàn thành', color: '#4caf50', icon: CheckCircle };
            case 7:
                return { label: 'Đã hủy', color: '#f5425d', icon: XCircle };
            case 8:
                return { label: 'Trả hàng', color: '#f54278', icon: RotateCcw };
            case 9:
                return { label: 'Chờ nhập hàng', color: '#ff9800', icon: AlertCircle };
            case 10:
                return { label: 'Có sự cố - Tạm dừng vận chuyển', color: '#f59e0b', icon: AlertTriangle };
            default:
                return { label: 'Không xác định', color: '#f54278', icon: AlertCircle };
        }
    };

    const getStatus = (status) => {
        switch (status) {
            case 1:
                return { label: 'Thành công', color: 'bg-yellow-200 text-yellow-800' };
            default:
                return { label: 'Không xác định', color: 'bg-gray-200 text-gray-800' };
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Hoàn thành':
                return 'bg-purple-100 text-purple-700 border border-purple-300';
            case 'Giao hàng':
                return 'bg-blue-100 text-blue-700 border border-blue-300';
            case 'Thanh toán':
                return 'bg-blue-100 text-blue-700 border border-blue-300';
            case 'Tiền mặt':
                return 'bg-orange-100 text-orange-700 border border-orange-300';
            case 'Thành công':
                return 'bg-green-100 text-green-700 border border-green-300';
            case 1:
                return 'bg-green-100 text-green-700 border border-green-300';
            default:
                return 'bg-gray-100 text-gray-700 border border-gray-300';
        }
    };

    const getActionButtonText = (status) => {
        switch (status) {
            case 1:
                return 'Xác nhận đơn hàng';
            case 2:
                return 'Xác nhận giao hàng';
            case 3:
                return 'Xác nhận lấy hàng';
            case 4:
                return 'Thanh toán';
            case 5:
                return 'Hoàn thành';
            case 6:
                return 'Đơn hàng đã hoàn thành';
            case 7:
                return 'Đơn hàng đã hủy';
            case 8:
                return 'Đơn hàng đã trả';
            case 9:
                return 'Nhập hàng';
            default:
                return 'Không xác định';
        }
    };

    const updateOrderStatus = async (newStatus, description = '') => {
        console.log('updateOrderStatus called with:', { newStatus, description, currentOrderStatus });

        try {
            const response = await fetch(`http://localhost:8080/api/hoa-don/${hoaDonId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newStatus),
            });

            console.log('API response status:', response.status);

            if (!response.ok) {
                throw new Error('Không thể cập nhật trạng thái hóa đơn');
            }

            // Cập nhật state trước
            console.log('Setting currentOrderStatus to:', newStatus);
            setCurrentOrderStatus(newStatus);

            // Lưu lịch sử đơn hàng sau khi đã cập nhật state
            console.log('Saving order history...');
            await saveOrderHistory(newStatus, description);

            // Fetch lại order history để cập nhật timeline với thời gian thực
            await fetchOrderHistory();

            // Gửi thông báo đến người dùng
            const userNotification = {
                khachHang: {
                    id: orderData.taiKhoan.id,
                },
                tieuDe: 'Cập nhật trạng thái đơn hàng',
                noiDung: `Đơn hàng #${hoaDonId} đã được cập nhật sang trạng thái: ${getStatusLabel(newStatus).label}`,
                // idRedirect: `/user/hoa-don/${hoaDonId}`,
                kieuThongBao: newStatus === 7 ? 'error' : newStatus === 8 ? 'warning' : 'info',
                trangThai: 0,
            };
            try {
                await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                    headers: { 'Content-Type': 'application/json' },
                });
                safeStompSend(`/app/user/${orderData.taiKhoan.id}/notifications`, {}, JSON.stringify(userNotification));
            } catch (notificationError) {
                console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                toast.warning('Không thể gửi thông báo đến người dùng.');
            }

            if (newStatus === 8) {
                const response = await axios.get(`http://localhost:8080/api/hoan-hang/hoa-don/${hoaDonId}`);
                if (response.data.success) {
                    setReturnHistory(response.data.data);
                }
            }

            toast.success('Cập nhật trạng thái đơn hàng thành công!');
        } catch (error) {
            console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
            toast.error('Không thể cập nhật trạng thái đơn hàng!');
        }
    };

    // Function xác nhận đơn hàng mới - chỉ cập nhật trạng thái allocation
    const confirmOrder = async (description = 'Xác nhận đơn hàng') => {
        console.log('confirmOrder called');

        try {
            // SỬ DỤNG API MỚI: Enhanced KhoHangService
            const response = await fetch(`http://localhost:8080/api/enhanced-kho-hang/confirm-order/${hoaDonId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            console.log('Confirm API response status:', response.status);

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Không thể xác nhận đơn hàng');
            }

            // Cập nhật state thành trạng thái "Đã xác nhận" (2)
            console.log('Setting currentOrderStatus to: 2');
            setCurrentOrderStatus(2);

            // Lưu lịch sử đơn hàng
            console.log('Saving order history...');
            await saveOrderHistory(2, description);

            // Fetch lại order history để cập nhật timeline với thời gian thực
            await fetchOrderHistory();

            // Gửi thông báo đến người dùng
            const userNotification = {
                khachHang: {
                    id: orderData.taiKhoan.id,
                },
                tieuDe: 'Đơn hàng đã được xác nhận',
                noiDung: `Đơn hàng #${hoaDonId} đã được xác nhận và đang chuẩn bị.`,
                kieuThongBao: 'success',
                trangThai: 0,
            };
            try {
                await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                    headers: { 'Content-Type': 'application/json' },
                });
                safeStompSend(`/app/user/${orderData.taiKhoan.id}/notifications`, {}, JSON.stringify(userNotification));
            } catch (notificationError) {
                console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                toast.warning('Không thể gửi thông báo đến người dùng.');
            }

            // Refresh order details so ProductList (and other UI) reflects updated stock counts immediately
            try {
                if (hoaDonId) {
                    console.log('Refreshing order details after confirm for hoaDonId:', hoaDonId);
                    await fetchBillDetails(hoaDonId);
                }
            } catch (refreshErr) {
                console.error('Không thể làm mới chi tiết hóa đơn sau khi xác nhận:', refreshErr);
            }

            toast.success('Xác nhận đơn hàng thành công! ');
        } catch (error) {
            console.error('Lỗi khi xác nhận đơn hàng:', error);
            toast.error('Không thể xác nhận đơn hàng: ' + error.message);
        }
    };

    // Client-side validation: ensure no order detail requests more than available stock
    const validateQuantitiesBeforeConfirm = () => {
        if (!Array.isArray(orderDetailDatas) || orderDetailDatas.length === 0) return true;

        const offending = orderDetailDatas
            .map((item) => {
                const requested = Number(item.soLuong || 0);
                const available = Number(item.sanPhamCT?.soLuong || 0);
                if (requested > available) {
                    const name = item.sanPhamCT?.ten || item.sanPhamCT?.sanPham?.ten || `Sản phẩm #${item.id}`;
                    return `${name} (yêu cầu: ${requested}, tồn kho: ${available})`;
                }
                return null;
            })
            .filter(Boolean);

        if (offending.length > 0) {
            const text = `Không thể xác nhận đơn hàng. Các sản phẩm sau vượt quá tồn kho:\n\n${offending.join('\n')}`;
            swal({
                title: 'Tồn kho không đủ',
                text,
                icon: 'warning',
                button: 'Đã hiểu',
            });
            return false;
        }
        return true;
    };

    // Function để quay lại trạng thái trước
    const revertOrderStatus = async (description = '') => {
        const previousStatus = getPreviousStatus(currentOrderStatus);

        if (!previousStatus) {
            toast.error('Không thể quay lại trạng thái trước đó!');
            return;
        }

        console.log('revertOrderStatus called with:', { currentOrderStatus, previousStatus, description });

        try {
            const response = await fetch(`http://localhost:8080/api/hoa-don/${hoaDonId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(previousStatus),
            });

            console.log('API response status:', response.status);

            if (!response.ok) {
                throw new Error('Không thể quay lại trạng thái trước đó');
            }

            // Cập nhật state trước
            console.log('Setting currentOrderStatus to:', previousStatus);
            setCurrentOrderStatus(previousStatus);

            // Lưu lịch sử đơn hàng với mô tả quay lại
            console.log('Saving order history for revert...');
            await saveOrderHistory(
                previousStatus,
                description || `Quay lại trạng thái: ${getStatusLabel(previousStatus).label}`,
            );

            // Fetch lại order history để cập nhật timeline với thời gian thực
            await fetchOrderHistory();

            // Gửi thông báo đến người dùng
            const userNotification = {
                khachHang: {
                    id: orderData.taiKhoan.id,
                },
                tieuDe: 'Cập nhật trạng thái đơn hàng',
                noiDung: `Đơn hàng #${hoaDonId} đã được quay lại trạng thái: ${getStatusLabel(previousStatus).label}`,
                // idRedirect: `/user/hoa-don/${hoaDonId}`,
                kieuThongBao: 'info',
                trangThai: 0,
            };
            try {
                await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                    headers: { 'Content-Type': 'application/json' },
                });
                safeStompSend(`/app/user/${orderData.taiKhoan.id}/notifications`, {}, JSON.stringify(userNotification));
            } catch (notificationError) {
                console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                toast.warning('Không thể gửi thông báo đến người dùng.');
            }

            toast.success('Quay lại trạng thái trước đó thành công!');
        } catch (error) {
            console.error('Lỗi khi quay lại trạng thái trước đó:', error);
            toast.error('Không thể quay lại trạng thái trước đó!');
        }
    };

    // Function để xác định trạng thái trước đó
    const getPreviousStatus = (currentStatus) => {
        switch (currentStatus) {
            case 2:
                return 1; // Chờ giao hàng -> Chờ xác nhận
            case 3:
                return 2; // Đang vận chuyển -> Chờ giao hàng
            case 4:
                return 3; // Đã giao hàng -> Đang vận chuyển
            case 5:
                return 4; // Đã thanh toán -> Đã giao hàng
            case 6:
                return 5; // Hoàn thành -> Đã thanh toán
            default:
                return null; // Không thể quay lại từ trạng thái 1, 7, 8
        }
    };

    // Function để kiểm tra có thể quay lại trạng thái trước không
    const canRevertStatus = (currentStatus) => {
        return getPreviousStatus(currentStatus) !== null && currentStatus !== 7 && currentStatus !== 8;
    };

    const handleActionButtonClick = (newStatus = null, description = '') => {
        console.log('handleActionButtonClick called with:', { newStatus, description, currentOrderStatus });

        if (newStatus) {
            // Nếu có newStatus được truyền từ OrderProgress
            console.log('Processing newStatus from OrderProgress:', newStatus);

            // Xử lý trạng thái 1 -> 2 (Chờ xác nhận -> Đã xác nhận) đặc biệt
            if (newStatus === 2 && currentOrderStatus === 1) {
                // Validate quantities before confirming
                if (!validateQuantitiesBeforeConfirm()) return;
                // Gọi API xác nhận đơn hàng mới
                console.log('Confirming order with new API');
                confirmOrder(description || 'Xác nhận đơn hàng');
                return;
            }

            // Xử lý các trường hợp đặc biệt khác
            // Trước khi chuyển sang trạng thái 3 (Đang vận chuyển), yêu cầu phí ship phải được nhập (>0)
            if (newStatus === 3) {
                const fee = Number(orderData?.phiShip ?? 0);
                if (!fee || fee <= 0) {
                    swal({
                        title: 'Thiếu phí giao hàng',
                        text: 'Vui lòng nhập Phí giao hàng (phiShip) trong mục Thông tin giao hàng trước khi Xác nhận giao hàng.',
                        icon: 'warning',
                        button: 'Đã hiểu',
                    });
                    return;
                }
            }

            if (newStatus === 5 && currentOrderStatus === 4) {
                // Trạng thái 4 -> 5 cần mở modal thanh toán thay vì cập nhật trạng thái ngay
                console.log('Opening payment modal for status 4 -> 5');
                setIsModalOpen(true);
            } else {
                // Các trường hợp bình thường - cập nhật trạng thái
                console.log('Updating order status to:', newStatus);
                updateOrderStatus(newStatus, description);
            }
        } else {
            // Logic cũ khi không có newStatus (gọi từ các nơi khác)
            console.log('Using old logic, currentOrderStatus:', currentOrderStatus);

            // Xử lý trạng thái 1 đặc biệt
            if (currentOrderStatus === 1) {
                // Validate quantities before confirming (old logic)
                if (!validateQuantitiesBeforeConfirm()) return;
                // Gọi API xác nhận đơn hàng mới
                console.log('Confirming order with new API (old logic)');
                confirmOrder(description || 'Xác nhận đơn hàng');
                return;
            }

            if (currentOrderStatus === 3) {
                // chuyển từ 3 -> 4 (Đang vận chuyển -> Đã giao hàng) là bình thường
                updateOrderStatus(4, description);
            } else if (currentOrderStatus === 2) {
                // khi không truyền newStatus, logic cũ có thể tăng trạng thái lên 3
                // Trước khi tăng lên 3, kiểm tra phí ship
                const fee = Number(orderData?.phiShip ?? 0);
                if (!fee || fee <= 0) {
                    swal({
                        title: 'Thiếu phí giao hàng',
                        text: 'Vui lòng nhập Phí giao hàng (phiShip) trong mục Thông tin giao hàng trước khi Xác nhận giao hàng.',
                        icon: 'warning',
                        button: 'Đã hiểu',
                    });
                    return;
                }
                updateOrderStatus(3, description);
            } else if (currentOrderStatus === 4) {
                setIsModalOpen(true);
            } else if (currentOrderStatus === 9) {
                setShowImportModal(true);
            } else if (currentOrderStatus < 7) {
                updateOrderStatus(currentOrderStatus + 1, description);
            }
        }
    };

    // Function để xử lý khi người dùng click button quay lại trạng thái trước
    const handleRevertStatus = () => {
        const previousStatus = getPreviousStatus(currentOrderStatus);

        if (!canRevertStatus(currentOrderStatus)) {
            toast.error('Không thể quay lại từ trạng thái hiện tại!');
            return;
        }

        swal({
            title: 'Xác nhận quay lại trạng thái trước',
            text: `Bạn có chắc chắn muốn quay lại trạng thái "${getStatusLabel(previousStatus).label}"?`,
            icon: 'warning',
            buttons: {
                cancel: 'Hủy',
                confirm: 'Xác nhận',
            },
            dangerMode: true,
        }).then((willRevert) => {
            if (willRevert) {
                revertOrderStatus(
                    `Admin quay lại trạng thái từ "${getStatusLabel(currentOrderStatus).label}" về "${getStatusLabel(previousStatus).label}"`,
                );
            }
        });
    };

    const calculateChange = () => {
        return customerMoney - total;
    };

    const handleSave = async () => {
        try {
            const newPayment = {
                hoaDon: { id: hoaDonId },
                taiKhoan: { id: admin?.id, hoTen: admin?.hoTen },
                ma: `PT-${Date.now()}`,
                tongTien: total,
                phuongThucThanhToan: paymentMethod,
                ghiChu: note || null,
                trangThai: 1,
                ngayTao: new Date().toISOString(),
            };

            const response = await fetch('http://localhost:8080/api/thanh-toan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newPayment),
            });

            if (!response.ok) {
                throw new Error('Không thể thêm thanh toán');
            }

            await updateOrderStatus(
                5,
                `Thanh toán thành công. Phương thức: ${paymentMethod}. ${note ? 'Ghi chú: ' + note : ''}`,
            );
            setIsModalOpen(false);
            const savedPayment = await response.json();
            setCheckOuts((prev) => [...prev, savedPayment]);
            toast.success('Lưu thanh toán thành công!');
        } catch (error) {
            console.error('Error saving payment:', error);
            toast.error('Không thể thêm thanh toán!');
        }
    };

    const handleClose = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setIsModalOpen(false);
        }, 200);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
        }).format(amount);
    };

    const isInsufficientFunds = paymentMethod === 'Tiền mặt' && customerMoney > 0 && customerMoney < total;

    const shouldShowActionButton = (status) => {
        return status !== 7 && status !== 8 && status !== 9;
    };

    const getActionButtonStyle = (status) => {
        if (status === 4) {
            return 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700';
        }
        if (status === 6) {
            return 'bg-gradient-to-r from-gray-400 to-gray-500 text-white cursor-not-allowed';
        }
        if (status === 9) {
            return 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700';
        }
        return 'text-blue-600 border-2 border-blue-300 hover:bg-blue-50';
    };

    const getInvoiceTypeStyle = (type) => {
        switch (type) {
            case 'Trực tuyến':
                return 'bg-purple-100 text-purple-700';
            case 'Tại quầy':
                return 'bg-green-100 text-green-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    const totalSteps = timeline.length;
    const currentStepIndex = ORDER_STEPS.indexOf(ORDER_STEPS.find((s) => s === currentOrderStatus));
    let progressPercentage = 0;
    if (currentStepIndex !== -1) {
        progressPercentage = ((currentStepIndex + 1) / totalSteps) * 100;
    } else if (currentOrderStatus === 6) {
        progressPercentage = 100;
    }

    const handleCancelOrder = async (reason = 'Đơn hàng đã được hủy') => {
        try {
            await updateOrderStatus(7, reason);
            toast.success('Đơn hàng đã được hủy!');
        } catch (error) {
            console.error('Error canceling order:', error);
            toast.error('Không thể hủy đơn hàng!');
        }
    };

    const handleApproveReturn = async (traHangId) => {
        const isConfirmed = await swal({
            title: 'Xác nhận duyệt trả hàng',
            text: 'Bạn có chắc chắn muốn duyệt yêu cầu trả hàng này?',
            icon: 'warning',
            buttons: ['Hủy', 'Xác nhận'],
            dangerMode: true,
        });

        if (isConfirmed) {
            try {
                await axios.put(`http://localhost:8080/api/hoa-don-ct/return/${traHangId}/approve`);
                const response = await axios.get(`http://localhost:8080/api/hoan-hang/hoa-don/${hoaDonId}`);
                if (response.data.success) {
                    setReturnHistory(response.data.data);
                }
                const fetchResponse = await axios.get(`http://localhost:8080/api/hoa-don-ct/hoa-don/${hoaDonId}`);
                setOrderDetailDatas(fetchResponse.data);
                const hoaDonResponse = await axios.get(`http://localhost:8080/api/hoa-don/${hoaDonId}`);
                setCurrentOrderStatus(hoaDonResponse.data.trangThai);
                // Gửi thông báo đến người dùng khi duyệt trả hàng
                const userNotification = {
                    khachHang: {
                        id: orderData.taiKhoan.id,
                    },
                    tieuDe: 'Yêu cầu trả hàng được duyệt',
                    noiDung: `Yêu cầu trả hàng cho đơn hàng #${hoaDonId} đã được duyệt.`,
                    idRedirect: `/user/hoa-don/${hoaDonId}`,
                    kieuThongBao: 'success',
                    trangThai: 0,
                };
                try {
                    await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                        headers: { 'Content-Type': 'application/json' },
                    });
                    if (stompClient) {
                        stompClient.send(
                            `/app/user/${orderData.taiKhoan?.id}/notifications`,
                            {},
                            JSON.stringify(userNotification),
                        );
                    }
                } catch (notificationError) {
                    console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                    toast.warning('Không thể gửi thông báo đến người dùng.');
                }
                toast.success('Yêu cầu trả hàng đã được duyệt!');
            } catch (error) {
                console.error('Lỗi khi duyệt yêu cầu trả hàng:', error);
                toast.error(error.response?.data?.message || 'Không thể duyệt yêu cầu trả hàng!');
            }
        }
    };

    const handleRejectReturn = async (traHangId) => {
        const isConfirmed = await swal({
            title: 'Xác nhận từ chối trả hàng',
            text: 'Bạn có chắc chắn muốn từ chối yêu cầu trả hàng này?',
            icon: 'warning',
            buttons: ['Hủy', 'Xác nhận'],
            dangerMode: true,
        });

        if (isConfirmed) {
            try {
                await axios.put(`http://localhost:8080/api/hoa-don-ct/return/${traHangId}/reject`);
                const response = await axios.get(`http://localhost:8080/api/hoan-hang/hoa-don/${hoaDonId}`);
                if (response.data.success) {
                    setReturnHistory(response.data.data);
                }
                // Gửi thông báo đến người dùng khi từ chối trả hàng
                const userNotification = {
                    khachHang: {
                        id: orderData.taiKhoan.id,
                    },
                    tieuDe: 'Yêu cầu trả hàng bị từ chối',
                    noiDung: `Yêu cầu trả hàng cho đơn hàng #${hoaDonId} đã bị từ chối.`,
                    idRedirect: `/user/hoa-don/${hoaDonId}`,
                    kieuThongBao: 'error',
                    trangThai: 0,
                };
                try {
                    await axios.post('http://localhost:8080/api/thong-bao', userNotification, {
                        headers: { 'Content-Type': 'application/json' },
                    });
                    if (stompClient) {
                        stompClient.send(
                            `/app/user/${orderData.taiKhoan?.id}/notifications`,
                            {},
                            JSON.stringify(userNotification),
                        );
                    }
                } catch (notificationError) {
                    console.error('Lỗi khi gửi thông báo đến người dùng:', notificationError);
                    toast.warning('Không thể gửi thông báo đến người dùng.');
                }
                toast.success('Yêu cầu trả hàng đã bị từ chối!');
            } catch (error) {
                console.error('Lỗi khi từ chối yêu cầu trả hàng:', error);
                toast.error(error.response?.data?.message || 'Không thể từ chối yêu cầu trả hàng!');
            }
        }
    };

    return (
        <>
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-5xl mx-auto">
                <OrderProgress
                    currentOrderStatus={currentOrderStatus}
                    setCurrentOrderStatus={setCurrentOrderStatus}
                    timeline={timeline}
                    getStatusInfo={getStatusInfo}
                    progressPercentage={progressPercentage}
                    shouldShowActionButton={shouldShowActionButton}
                    handleActionButtonClick={handleActionButtonClick}
                    getActionButtonStyle={getActionButtonStyle}
                    getActionButtonText={getActionButtonText}
                    handleCancelOrder={handleCancelOrder}
                    handleShowHistoryModal={handleShowHistoryModal}
                    handleRevertStatus={handleRevertStatus}
                    canRevertStatus={canRevertStatus}
                />
            </div>

            {/* Quản lý kho hàng - chỉ hiển thị cho admin */}
            {/* <div className="max-w-5xl mx-auto mt-8">
                <KhoHangManagement
                    hoaDon={orderData}
                    onRestoreComplete={() => {
                        // Refresh dữ liệu sau khi hoàn kho
                        fetchBillDetails(hoaDonId);
                    }}
                    currentOrderStatus={currentOrderStatus}
                />
            </div> */}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-5xl mx-auto mt-8">
                <OrderInfo
                    orderData={orderData}
                    currentOrderStatus={currentOrderStatus}
                    checkOut={checkOut}
                    getInvoiceTypeStyle={getInvoiceTypeStyle}
                    getStatusLabel={getStatusLabel}
                    getStatusStyle={getStatusStyle}
                    getStatus={getStatus}
                    onUpdateDeliveryInfo={handleUpdateDeliveryInfo}
                />
                <ProductList
                    orderDetailDatas={orderDetailDatas}
                    handleOpenProductModal={handleOpenProductModal}
                    handleQuantityChange={handleQuantityChange}
                    handleDeleteProduct={handleDeleteProduct}
                    isLiked={isLiked}
                    setIsLiked={setIsLiked}
                    isOrderInTransit={isOrderInTransit}
                    setOrderDetailDatas={setOrderDetailDatas}
                    hoaDonId={hoaDonId}
                    setReturnHistory={setReturnHistory}
                    currentOrderStatus={currentOrderStatus}
                    onReturnSuccess={handleReturnSuccess}
                />
            </div>

            {/* Sự cố vận chuyển - chỉ hiển thị khi đơn hàng đang vận chuyển hoặc có sự cố */}
            {(currentOrderStatus === 3 ||
                currentOrderStatus === 4 ||
                currentOrderStatus === 7 ||
                currentOrderStatus === 10) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-5xl mx-auto mt-8">
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center">
                                <AlertTriangle className="w-6 h-6 mr-2 text-red-600" />
                                Quản lý sự cố vận chuyển
                            </h2>
                            <button
                                onClick={handleOpenIncidentModal}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                <span>Báo cáo sự cố</span>
                            </button>
                        </div>
                        <p className="text-gray-600 mt-2">
                            Ghi nhận và quản lý các sự cố xảy ra trong quá trình vận chuyển đơn hàng
                        </p>
                    </div>

                    <div className="p-6">
                        <DeliveryIncidentList
                            hoaDonId={hoaDonId}
                            refreshTrigger={incidentRefreshTrigger}
                            stompClient={stompClient}
                            adminId={admin?.id}
                            onIncidentResolved={async (incident) => {
                                try {
                                    if (incident.isUnresolvable) {
                                        // Handle unresolvable incident - order should be cancelled
                                        console.log('Handling unresolvable incident - order will be cancelled');
                                        await updateOrderStatus(
                                            7, // CANCELLED
                                            `Đơn hàng bị hủy do sự cố vận chuyển không thể giải quyết (IncidentId=${incident.id})`,
                                        );

                                        // Send additional notification about cancellation and refund
                                        const cancellationNotification = {
                                            khachHang: {
                                                id: orderData.taiKhoan.id,
                                            },
                                            tieuDe: 'Đơn hàng đã được hủy và hoàn tiền',
                                            noiDung: `Đơn hàng #${orderData.ma} đã bị hủy do sự cố vận chuyển không thể giải quyết. Chúng tôi đã bắt đầu quy trình hoàn tiền và sẽ liên hệ với bạn trong vòng 24h.`,
                                            idRedirect: `/user/hoa-don/${hoaDonId}`,
                                            kieuThongBao: 'error',
                                            trangThai: 0,
                                        };

                                        try {
                                            await axios.post(
                                                'http://localhost:8080/api/thong-bao',
                                                cancellationNotification,
                                                {
                                                    headers: { 'Content-Type': 'application/json' },
                                                },
                                            );
                                            safeStompSend(
                                                `/app/user/${orderData.taiKhoan.id}/notifications`,
                                                {},
                                                JSON.stringify(cancellationNotification),
                                            );
                                        } catch (notificationError) {
                                            console.error('Lỗi khi gửi thông báo hủy đơn:', notificationError);
                                        }
                                    } else {
                                        // Handle normal resolved incident
                                        if (currentOrderStatus === 10) {
                                            await updateOrderStatus(
                                                3,
                                                `Gỡ khoá sau khi giải quyết sự cố (IncidentId=${incident.id})`,
                                            );
                                        }
                                    }

                                    // Refresh order details
                                    fetchBillDetails(hoaDonId);
                                    fetchOrderHistory();
                                } catch (err) {
                                    console.error('Error in onIncidentResolved handler:', err);
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {showProductModal && (
                <ProductModal
                    showProductModal={showProductModal}
                    handleCloseProductModal={handleCloseProductModal}
                    selectedBill={orderData}
                    fetchBillDetails={fetchBillDetails}
                    handleConfirmAddProduct={handleConfirmAddProduct}
                    currentOrderDetails={orderDetailDatas}
                />
            )}
            <PaymentDetails
                discountCode={discountCode}
                setDiscountCode={setDiscountCode}
                discountPercent={discountPercent}
                setDiscountPercent={setDiscountPercent}
                total={total}
                discountAmount={discountAmount}
                subtotal={subtotal}
                subtotalAfterProductDiscount={subtotal}
                hoaDonTotal={currentTongTien}
                shippingFee={shippingFee}
                items={orderDetailDatas}
                totalReturnAmount={totalReturnAmount}
                voucherInfo={orderData?.voucher}
            />
            <PaymentModal
                isOpen={isModalOpen}
                handleClose={handleClose}
                total={total}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                customerMoney={customerMoney}
                setCustomerMoney={setCustomerMoney}
                note={note}
                setNote={setNote}
                handleSave={handleSave}
                isInsufficientFunds={isInsufficientFunds}
                isAnimating={isAnimating}
                formatCurrency={formatCurrency}
                calculateChange={calculateChange}
            />
            {showImportModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold mb-4">Nhập hàng</h2>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700">Số lượng nhập</label>
                            <input
                                type="number"
                                value={importQuantity}
                                onChange={(e) => setImportQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                                min="1"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCloseImportModal}
                                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                className="bg-orange-500 text-white px-4 py-2 rounded-md text-sm hover:bg-orange-600"
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal hiển thị lịch sử đơn hàng */}
            {showHistoryModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
                        onClick={handleCloseHistoryModal}
                    />

                    {/* Modal Container */}
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-white/20 p-2 rounded-lg">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-xl font-bold">Lịch sử đơn hàng #{orderData.ma}</h2>
                                </div>
                                <button
                                    onClick={handleCloseHistoryModal}
                                    className="p-2 hover:bg-white/20 rounded-lg transition-colors duration-200"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-blue-100 mt-2 text-sm">
                                Theo dõi chi tiết các thay đổi trạng thái và hoạt động của đơn hàng
                            </p>
                        </div>

                        {/* Content */}
                        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
                            {loadingHistory ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                                    <span className="ml-3 text-gray-600 font-medium">Đang tải lịch sử...</span>
                                </div>
                            ) : orderHistory.length > 0 ? (
                                <div className="p-6">
                                    {/* Table Header */}
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                                                        <div className="flex items-center space-x-2">
                                                            <Calendar className="w-4 h-4 text-blue-600" />
                                                            <span>Thời gian</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                                                        <div className="flex items-center space-x-2">
                                                            <User className="w-4 h-4 text-green-600" />
                                                            <span>Người chỉnh sửa</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                                                        <div className="flex items-center space-x-2">
                                                            <ShieldCheck className="w-4 h-4 text-purple-600" />
                                                            <span>Trạng thái hóa đơn</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                                                        <div className="flex items-center space-x-2">
                                                            <FileText className="w-4 h-4 text-orange-600" />
                                                            <span>Ghi chú</span>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {orderHistory.map((history, index) => {
                                                    const statusInfo = getStatusLabel(history.trangThaiHoaDon) || {
                                                        label: history.trangThaiHoaDon || 'Không xác định',
                                                        color: 'bg-gray-100 text-gray-700',
                                                    };

                                                    return (
                                                        <tr
                                                            key={history.id}
                                                            className={`hover:bg-gray-50 transition-colors duration-200 ${
                                                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                                            }`}
                                                        >
                                                            {/* Thời gian */}
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center space-x-3">
                                                                    <div className="flex-shrink-0">
                                                                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                                            <span className="text-xs font-bold text-blue-600">
                                                                                {index + 1}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {new Date(
                                                                                history.ngayTao,
                                                                            ).toLocaleDateString('vi-VN', {
                                                                                year: 'numeric',
                                                                                month: '2-digit',
                                                                                day: '2-digit',
                                                                            })}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">
                                                                            {new Date(
                                                                                history.ngayTao,
                                                                            ).toLocaleTimeString('vi-VN', {
                                                                                hour: '2-digit',
                                                                                minute: '2-digit',
                                                                                second: '2-digit',
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Người chỉnh sửa */}
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center space-x-3">
                                                                    <div className="flex-shrink-0">
                                                                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                                            <User className="w-4 h-4 text-green-600" />
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {history.user?.hoTen || 'Hệ thống'}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">
                                                                            {history.user?.email ||
                                                                                'system@5shuttle.com'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Trạng thái hóa đơn */}
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span
                                                                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}
                                                                >
                                                                    <div className="w-2 h-2 rounded-full bg-current mr-2"></div>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </td>

                                                            {/* Ghi chú */}
                                                            <td className="px-6 py-4">
                                                                <div className="text-sm text-gray-900 max-w-xs">
                                                                    {history.moTa || 'Không có ghi chú'}
                                                                </div>
                                                                {history.moTa && history.moTa.length > 50 && (
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        Nhấn để xem đầy đủ...
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Summary */}
                                    <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                    <FileText className="w-5 h-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-gray-800">
                                                        Tổng quan lịch sử
                                                    </h3>
                                                    <p className="text-xs text-gray-600">
                                                        Đơn hàng có {orderHistory.length} lần thay đổi trạng thái
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-gray-800">
                                                    Trạng thái hiện tại
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                    {getStatusLabel(currentOrderStatus)?.label || 'Không xác định'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FileText className="w-10 h-10 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-600 mb-2">Chưa có lịch sử</h3>
                                    <p className="text-gray-500 max-w-sm mx-auto">
                                        Đơn hàng này chưa có thông tin lịch sử thay đổi trạng thái nào.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery Incident Modal */}
            <DeliveryIncidentModal
                isOpen={showIncidentModal}
                onClose={handleCloseIncidentModal}
                orderData={orderData}
                hoaDonId={hoaDonId}
                onIncidentReported={handleIncidentReported}
                stompClient={stompClient}
            />
        </>
    );
}

export default OrderStatus;

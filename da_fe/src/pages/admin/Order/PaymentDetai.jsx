// PaymentDetails.js
import React, { useEffect, useState } from 'react';
import { Percent, Calculator, Receipt } from 'lucide-react';

const PaymentDetails = ({
    discountCode,
    setDiscountCode,
    discountPercent,
    setDiscountPercent,
    total,
    discountAmount,
    subtotal,
    // Optional: subtotal after product-level promotions (preferred if caller supplies)
    subtotalAfterProductDiscount,
    // Optional: HoaDon.tongTien from server — prefer this for the displayed overall total
    hoaDonTotal,
    shippingFee = 0,
    // Optional: items array for calculating subtotal using promotion logic
    items = null,
    // Optional: tổng tiền hoàn hàng
    totalReturnAmount = 0,
    // Optional: voucher info for better display
    voucherInfo = null,
}) => {
    // Local state for inputs so we don't overwrite parent values
    const [localDiscountCode, setLocalDiscountCode] = useState(discountCode || '');
    const [localDiscountPercent, setLocalDiscountPercent] = useState(discountPercent || 0);

    // Hàm resolvePrices tương tự như trong orderDetail.jsx
    const resolvePrices = (item) => {
        const qty = Number(item?.soLuong ?? item?.quantity ?? 1);

        // Unit price actually charged (hoaDonCT.giaBan)
        let unitPrice = 0;
        if (item?.giaBan != null) {
            unitPrice = Number(item.giaBan);
        } else if (item?.donGia != null) {
            unitPrice = Number(item.donGia);
        } else if (item?.sanPhamCT?.donGia != null) {
            unitPrice = Number(item.sanPhamCT.donGia);
        }

        let unitOriginal = unitPrice;
        if (item?.giaGoc != null) {
            unitOriginal = Number(item.giaGoc);
        } else if (item?.sanPhamCT?.donGia != null) {
            unitOriginal = Number(item.sanPhamCT.donGia);
        }

        const toMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
        unitPrice = toMoney(unitPrice);
        unitOriginal = toMoney(unitOriginal);

        return {
            unitOriginalPrice: unitOriginal,
            unitDiscountedPrice: unitPrice,
            quantity: qty,
            lineDiscountedTotal: toMoney(unitPrice * qty),
            lineOriginalTotal: toMoney(unitOriginal * qty),
        };
    };

    // Tính toán subtotal sử dụng logic promotion giống orderDetail.jsx
    const calculateSubtotalFromItems = () => {
        if (Array.isArray(items) && items.length > 0) {
            return items.reduce((sum, it) => {
                const { unitDiscountedPrice, quantity } = resolvePrices(it);
                return sum + unitDiscountedPrice * quantity;
            }, 0);
        }
        return 0;
    };

    const calculatedSubtotal = calculateSubtotalFromItems();

    // Sync local inputs when discount becomes active or inactive
    useEffect(() => {
        if (Number(discountAmount) > 0) {
            // restore from props when discount applies
            setLocalDiscountCode(discountCode || '');
            setLocalDiscountPercent(discountPercent || 0);
        } else {
            // clear inputs when discount not applied
            setLocalDiscountCode('');
            setLocalDiscountPercent(0);
        }
    }, [discountAmount, discountCode, discountPercent]);
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                        <div className="flex items-center gap-3">
                            <Receipt className="w-8 h-8" />
                            <h2 className="text-2xl font-bold">Chi tiết thanh toán</h2>
                        </div>
                    </div>

                    {/* Content - Horizontal Layout */}
                    <div className="p-8">
                        {/* Main Horizontal Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                            {/* Discount Code Section */}
                            <div className="lg:col-span-1">
                                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100 h-full">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Percent className="w-5 h-5 text-purple-600" />
                                        <h3 className="font-semibold text-gray-800">Mã giảm giá</h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Phiếu giảm giá:
                                            </label>
                                            <input
                                                type="text"
                                                value={localDiscountCode}
                                                onChange={(e) => {
                                                    setLocalDiscountCode(e.target.value);
                                                    if (typeof setDiscountCode === 'function')
                                                        setDiscountCode(e.target.value);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-sm bg-gray-100 cursor-not-allowed"
                                                placeholder="Nhập mã"
                                                disabled
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Giá trị giảm:
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={(() => {
                                                        if (voucherInfo && voucherInfo.kieuGiaTri !== undefined) {
                                                            // Hiển thị theo kiểu voucher
                                                            return voucherInfo.kieuGiaTri === 0 
                                                                ? `${voucherInfo.giaTri}%`
                                                                : `${Number(voucherInfo.giaTri)?.toLocaleString()}đ`;
                                                        }
                                                        // Nếu discountAmount > 0 và có discountPercent thì hiển thị %
                                                        if (localDiscountPercent > 0) {
                                                            return `${localDiscountPercent}%`;
                                                        }
                                                        // Nếu discountAmount > 0 nhưng không có % thì là tiền cố định
                                                        if (Number(discountAmount) > 0) {
                                                            return `${Number(discountAmount).toLocaleString()}đ`;
                                                        }
                                                        return '0';
                                                    })()}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-sm bg-gray-100 cursor-not-allowed"
                                                    placeholder="0"
                                                    disabled
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Summary Section */}
                            <div className="lg:col-span-3 grid grid-cols-1 gap-6">
                                <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl p-6 border border-orange-100 h-full">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calculator className="w-5 h-5 text-orange-600" />
                                        <h3 className="font-semibold text-gray-800">Tóm tắt</h3>
                                    </div>

                                    <div className="space-y-3">
                                        {/**
                                         * Display subtotal. Priority order:
                                         * 1. calculatedSubtotal (from items using resolvePrices logic)
                                         * 2. subtotalAfterProductDiscount (caller-provided promoted subtotal)
                                         * 3. subtotal (fallback)
                                         */}
                                        {(() => {
                                            let displaySubtotal;
                                            let productPromoSavings = 0;

                                            // FIX: Prefer parent-provided subtotalAfterProductDiscount (already correct after returns)
                                            if (
                                                subtotalAfterProductDiscount !== undefined &&
                                                subtotalAfterProductDiscount !== null
                                            ) {
                                                displaySubtotal = Number(subtotalAfterProductDiscount);
                                                if (subtotal) {
                                                    productPromoSavings = Number(subtotal) - displaySubtotal;
                                                }
                                            } else if (calculatedSubtotal !== null) {
                                                // Fallback to locally calculated subtotal from items
                                                displaySubtotal = calculatedSubtotal;
                                                if (subtotal) {
                                                    productPromoSavings = Number(subtotal) - calculatedSubtotal;
                                                }
                                            } else {
                                                // Last resort: original subtotal
                                                displaySubtotal = Number(subtotal || 0);
                                            }

                                            return (
                                                <>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-700">Tổng tiền hàng:</span>
                                                        <span className="font-semibold text-gray-900">
                                                            {displaySubtotal.toLocaleString()} VNĐ
                                                        </span>
                                                    </div>

                                                    {/* If caller provided a product-level discounted subtotal, show savings */}
                                                    {/* {productPromoSavings > 0 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-700">
                                                                Tiết kiệm (khuyến mãi sản phẩm):
                                                            </span>
                                                            <span className="font-semibold text-green-700">
                                                                -{productPromoSavings.toLocaleString()} VNĐ
                                                            </span>
                                                        </div>
                                                    )} */}

                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-700">Giảm giá:</span>
                                                        <span className="font-semibold text-red-600">
                                                            -{discountAmount.toLocaleString()} VNĐ
                                                        </span>
                                                    </div>

                                                    <div className="flex justify-between items-center text-sm border-b border-orange-200 pb-2">
                                                        <span className="text-gray-700">Phí vận chuyển:</span>
                                                        <span className="font-semibold text-gray-900">{`+${Number(shippingFee).toLocaleString('vi-VN')} VNĐ`}</span>
                                                    </div>

                                                    {/* Hiển thị tiền hoàn hàng nếu có */}
                                                    {/* {totalReturnAmount > 0 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-700">Tiền hoàn hàng:</span>
                                                            <span className="font-semibold text-orange-600">
                                                                -{Number(totalReturnAmount).toLocaleString('vi-VN')} VNĐ
                                                            </span>
                                                        </div>
                                                    )} */}
                                                </>
                                            );
                                        })()}

                                        <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-lg p-3 mt-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-white font-bold">Tổng tiền:</span>
                                                <span className="text-white font-bold text-lg">
                                                    {(hoaDonTotal !== undefined && hoaDonTotal !== null
                                                        ? Number(hoaDonTotal)
                                                        : Number(total || 0)
                                                    ).toLocaleString()}{' '}
                                                    VNĐ
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentDetails;

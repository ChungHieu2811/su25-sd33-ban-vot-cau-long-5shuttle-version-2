import React from 'react';
import { X, Tag, Clock, Gift, Star, Sparkles, Calendar, DollarSign, CheckCircle } from 'lucide-react';
import swal from 'sweetalert';

const DiscountModal = ({ showModal, setShowModal, discounts, selectedDiscount, handleSelectDiscount, handleRemoveDiscount, totalPrice }) => {
    if (!showModal) return null;

    // Tính toán số tiền tiết kiệm cho mỗi voucher
    const calculateSavings = (discount) => {
        if (totalPrice < discount.dieuKienNhoNhat) return 0;
        
        let savings;
        if (discount.kieuGiaTri === 0) {
            // Giảm theo phần trăm
            savings = (totalPrice * discount.giaTri) / 100;
            return Math.min(savings, discount.giaTriMax);
        } else {
            // Giảm theo số tiền cố định
            savings = discount.giaTri;
        }
        return savings;
    };

    // Kiểm tra voucher có thể áp dụng không
    const isVoucherApplicable = (discount) => {
        return totalPrice >= discount.dieuKienNhoNhat && discount.soLuong > 0;
    };

    // Kiểm tra voucher còn số lượng không
    const isVoucherInStock = (discount) => {
        return discount.soLuong > 0;
    };

console.log('Selected Discount:', discounts);

    // Sắp xếp voucher theo mức tiết kiệm giảm dần
    const sortedDiscounts = [...discounts].sort((a, b) => calculateSavings(b) - calculateSavings(a));
    

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setShowModal(false)}
            />
            
            <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden">
                {/* Header đơn giản */}
                <div className="bg-gray-50 px-6 py-5 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 rounded-xl p-2">
                                <Gift className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800">
                                    Phiếu giảm giá
                                </h2>
                                <p className="text-gray-600 text-sm">
                                    Chọn voucher phù hợp
                                </p>
                            </div>
                        </div>
                        
                        <button
                            onClick={() => setShowModal(false)}
                            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Thống kê */}
                    <div className="mt-4 flex gap-4 text-sm">
                        <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <div className="text-gray-500">Khả dụng</div>
                            <div className="text-gray-800 font-medium">{discounts.filter(d => isVoucherApplicable(d)).length}</div>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <div className="text-gray-500">Tiết kiệm tối đa</div>
                            <div className="text-gray-800 font-medium">
                                {Math.max(...sortedDiscounts.map(d => calculateSavings(d))).toLocaleString('vi-VN')}đ
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
                    <div className="space-y-3">
                        {sortedDiscounts.map((discount, index) => {
                            const savings = calculateSavings(discount);
                            const applicable = isVoucherApplicable(discount);
                            const isSelected = selectedDiscount?.id === discount.id;

                            return (
                                <div
                                    key={discount.id}
                                    className={`relative border rounded-xl p-4 transition-all duration-200 ${
                                        isSelected
                                            ? 'border-blue-300 bg-blue-50'
                                            : applicable
                                            ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                                            : 'border-gray-200 bg-gray-50 opacity-70'
                                    }`}
                                >
                                    {/* Best deal badge */}
                                    {index === 0 && applicable && savings > 0 && (
                                        <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-medium px-2 py-1 rounded-lg">
                                            Tốt nhất
                                        </div>
                                    )}

                                    {/* Remove button */}
                                    {isSelected && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveDiscount();
                                            }}
                                            className="absolute top-3 right-3 text-gray-400 hover:text-red-500 bg-white rounded-full p-1 shadow-sm"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}

                                    <div className="space-y-3">
                                        {/* Header */}
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                    applicable 
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-gray-200 text-gray-500'
                                                }`}>
                                                    VOUCHER
                                                </span>
                                                {isSelected && (
                                                    <span className="bg-green-100 text-green-700 rounded px-2 py-1 text-xs font-medium flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" />
                                                        Đã chọn
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {applicable && savings > 0 && (
                                                <div className="text-green-600 font-medium text-sm">
                                                    Tiết kiệm {savings.toLocaleString('vi-VN')}đ
                                                </div>
                                            )}
                                        </div>

                                        {/* Title và discount */}
                                        <div>
                                            <h3 className={`font-medium text-base mb-2 ${
                                                applicable ? 'text-gray-800' : 'text-gray-500'
                                            }`}>
                                                {discount.ten}
                                            </h3>
                                            
                                            <div className="flex items-center gap-2">
                                                <span className={`text-2xl font-bold ${
                                                    applicable ? 'text-red-600' : 'text-gray-400'
                                                }`}>
                                                    {discount.kieuGiaTri === 0 
                                                        ? `${discount.giaTri}%`
                                                        : `${discount.giaTri?.toLocaleString()}đ`
                                                    }
                                                </span>
                                                <span className="text-gray-500 text-sm">giảm giá</span>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        {discount.moTa && (
                                            <p className="text-gray-600 text-sm">
                                                {discount.moTa}
                                            </p>
                                        )}

                                        {/* Conditions */}
                                        <div className="space-y-1 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-gray-400" />
                                                <span>Tối thiểu: <strong>{discount.dieuKienNhoNhat.toLocaleString('vi-VN')}đ</strong></span>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <Gift className="w-4 h-4 text-gray-400" />
                                                <span>Số lượng còn lại: 
                                                    <strong className={discount.soLuong <= 5 && discount.soLuong > 0 ? 'text-orange-600' : discount.soLuong === 0 ? 'text-red-600' : 'text-gray-800'}>
                                                        {discount.soLuong}
                                                    </strong>
                                                    {discount.soLuong === 0 && <span className="text-red-600 font-medium"> (Hết hàng)</span>}
                                                    {discount.soLuong > 0 && discount.soLuong <= 5 && <span className="text-orange-600"> (Sắp hết)</span>}
                                                </span>
                                            </div>
                                            
                                            {discount.kieuGiaTri === 0 && (
                                                <div className="flex items-center gap-2">
                                                    <Gift className="w-4 h-4 text-gray-400" />
                                                    <span>Giảm tối đa: <strong>{discount.giaTriMax.toLocaleString('vi-VN')}đ</strong></span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-gray-400" />
                                                <span className="text-xs">
                                                    {new Date(discount.ngayBatDau).toLocaleDateString('vi-VN')} - {' '}
                                                    {new Date(discount.ngayKetThuc).toLocaleDateString('vi-VN')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action button */}
                                        {!isSelected && (
                                            <button
                                                onClick={() => {
                                                    if (discount.soLuong === 0) {
                                                        swal('Voucher hết hàng', 
                                                            'Voucher này đã hết số lượng, vui lòng chọn voucher khác', 
                                                            'error'
                                                        );
                                                        return;
                                                    }
                                                    
                                                    if (!applicable) {
                                                        swal('Không đủ điều kiện', 
                                                            `Đơn hàng cần tối thiểu ${discount.dieuKienNhoNhat.toLocaleString('vi-VN')}đ để áp dụng voucher này`, 
                                                            'warning'
                                                        );
                                                        return;
                                                    }

                                                    let discountAmount;
                                                    if (discount.kieuGiaTri === 0) {
                                                        // Giảm theo phần trăm
                                                        discountAmount = (totalPrice * discount.giaTri) / 100;
                                                        if (discountAmount > discount.giaTriMax) {
                                                            discountAmount = discount.giaTriMax;
                                                            swal('Áp dụng thành công!', 
                                                                `Bạn được giảm ${discount.giaTriMax.toLocaleString('vi-VN')}đ (giá trị tối đa)`, 
                                                                'success'
                                                            );
                                                        }
                                                    } else {
                                                        // Giảm theo số tiền cố định
                                                        discountAmount = discount.giaTri;
                                                        swal('Áp dụng thành công!', 
                                                            `Bạn được giảm ${discount.giaTri.toLocaleString('vi-VN')}đ`, 
                                                            'success'
                                                        );
                                                    }

                                                    handleSelectDiscount(discount);
                                                }}
                                                disabled={!applicable}
                                                className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors text-sm ${
                                                    applicable && discount.soLuong > 0
                                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                }`}
                                            >
                                                {discount.soLuong === 0 
                                                    ? 'Hết hàng' 
                                                    : applicable 
                                                        ? 'Áp dụng voucher' 
                                                        : 'Không đủ điều kiện'
                                                }
                                            </button>
                                        )}

                                        {/* Warning */}
                                        {discount.soLuong === 0 && (
                                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                                <X className="w-4 h-4 inline mr-1" />
                                                Voucher này đã hết số lượng
                                            </div>
                                        )}
                                        
                                        {!applicable && discount.soLuong > 0 && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                                                <Clock className="w-4 h-4 inline mr-1" />
                                                Cần mua thêm {(discount.dieuKienNhoNhat - totalPrice).toLocaleString('vi-VN')}đ
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">
                            <span className="font-medium">{discounts.filter(d => isVoucherApplicable(d)).length}</span> 
                            <span> / {discounts.length} voucher khả dụng</span>
                        </div>
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-300 transition-colors text-sm font-medium"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiscountModal;
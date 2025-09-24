package com.example.da_be.service;

import com.example.da_be.dto.CancelIncidentRequest;
import com.example.da_be.dto.IncidentRefundRequest;
import com.example.da_be.dto.IncidentRefundResponse;
import com.example.da_be.dto.RestoreStockIncidentRequest;
import com.example.da_be.dto.RestoreStockResponse;
import com.example.da_be.dto.UpdateDeliveryInfoRequest;
import com.example.da_be.entity.HoaDon;
import com.example.da_be.entity.HoaDonCT;
import com.example.da_be.entity.PhieuGiamGia;
import com.example.da_be.entity.SuCoVanChuyen;
import com.example.da_be.entity.ThongBao;
import com.example.da_be.exception.ResourceNotFoundException;
import com.example.da_be.repository.HoaDonCTRepository;
import com.example.da_be.repository.HoaDonRepository;
import com.example.da_be.repository.SuCoVanChuyenRepository;
import com.example.da_be.repository.ThongBaoRepository;
import com.example.da_be.repository.VoucherRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class HoaDonService {

    private static final Logger log = LoggerFactory.getLogger(HoaDonService.class);

    @Autowired
    private HoaDonRepository hoaDonRepository;
    @Autowired
    private VoucherRepository voucherRepository;
    @Autowired
    private ThongBaoRepository thongBaoRepository;
    @Autowired
    private KhoHangService khoHangService;
    @Autowired
    private SuCoVanChuyenRepository suCoVanChuyenRepository;
    @Autowired
    private HoaDonCTRepository hoaDonCTRepository;
    @Autowired
    private com.example.da_be.service.HoaDonCTService hoaDonCTService;

    public List<HoaDon> getAllHoaDon() {
        return hoaDonRepository.findAll();
    }

    public HoaDon getHoaDonById(int id) {
        return hoaDonRepository.findById(id).orElse(null);
    }

    public HoaDon saveOrUpdateHoaDon(HoaDon hoaDon) {
        return hoaDonRepository.save(hoaDon);
    }

    public void deleteHoaDonById(int id) {
        hoaDonRepository.deleteById(id);
    }


    /**
     * Xác nhận đơn hàng và trừ stock thực tế
     * Thay đổi trạng thái từ "Chờ xác nhận" (1) sang "Đã xác nhận" (2)
     */
    @Transactional
    public HoaDon confirmOrder(int id) {
        HoaDon hoaDon = hoaDonRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));
        
        // Kiểm tra trạng thái hiện tại
        if (hoaDon.getTrangThai() != 1) {
            throw new IllegalArgumentException("Chỉ có thể xác nhận đơn hàng có trạng thái 'Chờ xác nhận'");
        }
        
        try {
            // Trừ số lượng stock thực tế
            khoHangService.confirmOrderAndReduceStock(hoaDon);
            
            // Cập nhật trạng thái
            hoaDon.setTrangThai(2); // 2 = Đã xác nhận
            hoaDon.setNgaySua(new Date());
            
            // Tạo thông báo cho khách hàng
            if (hoaDon.getTaiKhoan() != null) {
                ThongBao thongBao = new ThongBao();
                thongBao.setKhachHang(hoaDon.getTaiKhoan());
                thongBao.setTieuDe("Đơn hàng đã được xác nhận");
                thongBao.setNoiDung("Đơn hàng #" + hoaDon.getMa() + " đã được xác nhận và đang chuẩn bị.");
                thongBao.setTrangThai(1);
                thongBaoRepository.save(thongBao);
            }
            
            log.info("Đã xác nhận đơn hàng thành công: {}", hoaDon.getMa());
            return hoaDonRepository.save(hoaDon);
            
        } catch (Exception e) {
            log.error("Lỗi khi xác nhận đơn hàng {}: {}", hoaDon.getMa(), e.getMessage());
            throw new RuntimeException("Không thể xác nhận đơn hàng: " + e.getMessage());
        }
    }

    @Transactional
    public HoaDon updateHoaDonStatus(int id, int newStatus) {
        HoaDon hoaDon = hoaDonRepository.findById(id).orElse(null);
        if (hoaDon != null) {
            int oldStatus = hoaDon.getTrangThai();
            hoaDon.setTrangThai(newStatus);
            // Nếu chuyển sang trạng thái 6 (Đã thanh toán), cập nhật HoaDonCT tương ứng
            if (newStatus == 6) {
                try {
                    log.info("About to update HoaDonCT rows to 6 for hoaDonId={}", id);
                    hoaDonCTService.updateAllHoaDonCTStatusByHoaDonId(id, 6);
                    log.info("Completed updating HoaDonCT rows to 6 for hoaDonId={}", id);
                } catch (Exception e) {
                    log.error("Lỗi khi cập nhật HoaDonCT cho hoaDonId={}: {}", id, e.getMessage());
                }
            }
            
            // Xử lý hoàn kho khi hủy đơn hàng
            if (newStatus == 7 && oldStatus != 7) { // Trạng thái 7 = Đã hủy
                try {
                    // CHỈ hoàn kho nếu đơn hàng đã được xác nhận (trangThai >= 2)
                    // Vì đơn hàng ở trạng thái 1 chưa bị trừ stock thực tế
                    if (oldStatus >= 2) {
                        khoHangService.restoreStockOnCancelOrder(hoaDon);
                        log.info("Đã hoàn kho thành công cho đơn hàng bị hủy: {} (trạng thái cũ: {})", hoaDon.getMa(), oldStatus);
                    } else {
                        log.info("Không cần hoàn kho cho đơn hàng chưa xác nhận: {} (trạng thái cũ: {})", hoaDon.getMa(), oldStatus);
                    }
                } catch (Exception e) {
                    log.error("Lỗi khi hoàn kho cho đơn hàng bị hủy: {} - {}", hoaDon.getMa(), e.getMessage());
                    // Không ném exception để không làm gián đoạn flow chính
                    // Có thể thông báo cho admin để xử lý thủ công
                }
            }
            
            return hoaDonRepository.save(hoaDon);
        }
        return null;
    }

    /**
     * Cập nhật trạng thái đơn hàng mà KHÔNG tự động hoàn kho
     * Dùng cho trường hợp đã xử lý hoàn kho riêng (như sự cố vận chuyển)
     */
    @Transactional
    public HoaDon updateHoaDonStatusWithoutStockRestore(int id, int newStatus) {
        HoaDon hoaDon = hoaDonRepository.findById(id).orElse(null);
        if (hoaDon != null) {
            int oldStatus = hoaDon.getTrangThai();
            hoaDon.setTrangThai(newStatus);
            
            log.info("Cập nhật trạng thái đơn hàng {} từ {} sang {} - KHÔNG tự động hoàn kho", 
                    hoaDon.getMa(), oldStatus, newStatus);
            
            return hoaDonRepository.save(hoaDon);
        }
        return null;
    }

    @Transactional
    public HoaDon xacNhanThanhToan(Integer idHoaDon, BigDecimal tongTien,
                                   BigDecimal khachThanhToan, Integer idVoucher,
                                   String phuongThucThanhToan) {
        // 1. Kiểm tra hóa đơn tồn tại
        HoaDon hoaDon = hoaDonRepository.findById(idHoaDon)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));

        // 2. Kiểm tra số tiền thanh toán hợp lệ
        if (khachThanhToan.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Số tiền thanh toán phải lớn hơn 0");
        }

        // 3. Xử lý voucher nếu có
        if (idVoucher != null) {
            PhieuGiamGia voucher = voucherRepository.findById(idVoucher)
                    .orElseThrow(() -> new ResourceNotFoundException("Voucher không tồn tại"));

            // Kiểm tra voucher còn số lượng không
            if (voucher.getSoLuong() <= 0) {
                throw new IllegalArgumentException("Phiếu giảm giá đã hết số lượng");
            }

            // Kiểm tra voucher còn hiệu lực không
            LocalDateTime now = LocalDateTime.now();
            if (now.isBefore(voucher.getNgayBatDau()) || now.isAfter(voucher.getNgayKetThuc())) {
                throw new IllegalArgumentException("Phiếu giảm giá đã hết hạn hoặc chưa có hiệu lực");
            }

            // Kiểm tra điều kiện tối thiểu
            if (tongTien.compareTo(BigDecimal.valueOf(voucher.getDieuKienNhoNhat())) < 0) {
                throw new IllegalArgumentException("Đơn hàng chưa đủ điều kiện áp dụng phiếu giảm giá");
            }

            // Trừ số lượng voucher
            voucher.setSoLuong(voucher.getSoLuong() - 1);
            
            // Nếu hết voucher thì cập nhật trạng thái
            if (voucher.getSoLuong() == 0) {
                voucher.setTrangThai(0); // 0 = Hết hàng/Không hoạt động
            }
            
            // Lưu voucher đã được cập nhật
            voucherRepository.save(voucher);

            hoaDon.setVoucher(voucher);
        }

        // 4. Cập nhật thông tin hóa đơn
        hoaDon.setTongTien(tongTien);
        hoaDon.setPhuongThucThanhToan(phuongThucThanhToan);
        hoaDon.setTrangThai(6); // 6 = Đã thanh toán
        hoaDon.setNgaySua(new Date());

        // 5. Cập nhật trạng thái chi tiết hóa đơn thành 6
        try {
            log.info("About to update HoaDonCT rows to 6 for hoaDonId={} (xacNhanThanhToan)", idHoaDon);
            hoaDonCTService.updateAllHoaDonCTStatusByHoaDonId(idHoaDon, 6);
            log.info("Completed update HoaDonCT rows to 6 for hoaDonId={} (xacNhanThanhToan)", idHoaDon);
        } catch (Exception e) {
            log.error("Lỗi khi cập nhật trạng thái HoaDonCT khi thanh toán cho hoaDonId={}: {}", idHoaDon, e.getMessage());
        }

        // 6. Lưu hóa đơn
        HoaDon updatedHoaDon = hoaDonRepository.save(hoaDon);

        // 6. Tạo thông báo cho khách hàng
        ThongBao thongBao = new ThongBao();
        thongBao.setKhachHang(hoaDon.getTaiKhoan());
        thongBao.setTieuDe("Thanh toán thành công");
        thongBao.setNoiDung("Hóa đơn #" + hoaDon.getMa() + " đã được thanh toán");
        thongBao.setTrangThai(1);
        thongBaoRepository.save(thongBao);

        return updatedHoaDon;
    }

    @Transactional
    public HoaDon updateDeliveryInfo(Integer idHoaDon, UpdateDeliveryInfoRequest request) {
        HoaDon hoaDon = hoaDonRepository.findById(idHoaDon)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));

        // Cập nhật thông tin giao hàng
        if (request.getTenNguoiNhan() != null) {
            hoaDon.setTenNguoiNhan(request.getTenNguoiNhan());
        }
        if (request.getSdtNguoiNhan() != null) {
            hoaDon.setSdtNguoiNhan(request.getSdtNguoiNhan());
        }
        if (request.getDiaChiNguoiNhan() != null) {
            hoaDon.setDiaChiNguoiNhan(request.getDiaChiNguoiNhan());
        }
        
        // Cập nhật phí ship nếu có
        if (request.getPhiShip() != null) {
            hoaDon.setPhiShip(request.getPhiShip());
        }

        hoaDon.setNgaySua(new Date());
        return hoaDonRepository.save(hoaDon);
    }

    /**
     * Hủy đơn hàng do sự cố vận chuyển không thể giải quyết
     */
    @Transactional
    public HoaDon cancelOrderDueToIncident(Integer hoaDonId, com.example.da_be.dto.CancelIncidentRequest request) {
        // 1. Kiểm tra hóa đơn tồn tại
        HoaDon hoaDon = hoaDonRepository.findById(hoaDonId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));

        // 2. Kiểm tra sự cố tồn tại và thuộc về hóa đơn này
        if (request.getIncidentId() != null) {
            SuCoVanChuyen incident = suCoVanChuyenRepository.findById(request.getIncidentId())
                    .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy sự cố"));
            
            if (!incident.getHoaDon().getId().equals(hoaDonId)) {
                throw new IllegalArgumentException("Sự cố không thuộc về hóa đơn này");
            }
        }

        // 3. Kiểm tra trạng thái đơn hàng có thể hủy không
        if (hoaDon.getTrangThai() == 7) {
            throw new IllegalArgumentException("Đơn hàng đã bị hủy trước đó");
        }

        // 4. Hủy đơn hàng với lý do cụ thể
        int oldStatus = hoaDon.getTrangThai();
        hoaDon.setTrangThai(7); // 7 = Đã hủy
        hoaDon.setNgaySua(new Date());
        
        // Ghi chú lý do hủy
        String cancelNote = String.format("Hủy do sự cố vận chuyển không thể giải quyết. " +
                "Incident ID: %d. Lý do: %s. Admin: %d", 
                request.getIncidentId(), request.getReason(), request.getAdminId());
        
        // Nếu có field ghi chú, có thể set ở đây
        // hoaDon.setGhiChu(cancelNote);

        // 5. Hoàn kho hàng (có điều kiện dựa trên loại sự cố)
        try {
            // Kiểm tra loại sự cố để quyết định có hoàn kho hay không
            if (request.getIncidentId() != null) {
                SuCoVanChuyen incident = suCoVanChuyenRepository.findById(request.getIncidentId()).orElse(null);
                if (incident != null) {
                    boolean shouldRestoreStock = shouldRestoreStockForIncidentType(incident.getLoaiSuCo());
                    
                    if (shouldRestoreStock) {
                        khoHangService.restoreStockOnCancelOrder(hoaDon);
                        log.info("Đã hoàn kho thành công cho đơn hàng bị hủy do sự cố: {} (Loại: {})", 
                                hoaDon.getMa(), incident.getLoaiSuCo());
                    } else {
                        // Ghi log không hoàn kho cho hàng hỏng/mất
                        log.info("Không hoàn kho cho đơn hàng {} do loại sự cố: {} (hàng không thể tái sử dụng)", 
                                hoaDon.getMa(), incident.getLoaiSuCo());
                        
                        // Ghi vào kho hàng hỏng/mất để tracking
                        khoHangService.recordDamagedOrLostStock(hoaDon, incident.getLoaiSuCo(), request.getReason());
                    }
                } else {
                    // Không tìm thấy sự cố, hoàn kho mặc định
                    khoHangService.restoreStockOnCancelOrder(hoaDon);
                    log.info("Đã hoàn kho thành công cho đơn hàng bị hủy (không xác định được loại sự cố): {}", hoaDon.getMa());
                }
            } else {
                // Không có incident ID, hoàn kho mặc định
                khoHangService.restoreStockOnCancelOrder(hoaDon);
                log.info("Đã hoàn kho thành công cho đơn hàng bị hủy: {}", hoaDon.getMa());
            }
        } catch (Exception e) {
            log.error("Lỗi khi xử lý kho cho đơn hàng bị hủy do sự cố: {} - {}", hoaDon.getMa(), e.getMessage());
            // Tiếp tục thực hiện, không ném exception
        }

        // 6. Lưu hóa đơn
        HoaDon cancelledOrder = hoaDonRepository.save(hoaDon);

        log.info("Đã hủy đơn hàng {} do sự cố vận chuyển không thể giải quyết. " +
                "Incident ID: {}, Admin: {}", hoaDon.getMa(), request.getIncidentId(), request.getAdminId());

        return cancelledOrder;
    }

    /**
     * Xử lý hoàn tiền cho đơn hàng bị sự cố
     */
    @Transactional
    public IncidentRefundResponse processIncidentRefund(Integer hoaDonId, IncidentRefundRequest request) {
        // 1. Kiểm tra hóa đơn tồn tại
        HoaDon hoaDon = hoaDonRepository.findById(hoaDonId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));

        // 2. Kiểm tra đơn hàng đã bị hủy
        if (hoaDon.getTrangThai() != 7) {
            throw new IllegalArgumentException("Chỉ có thể hoàn tiền cho đơn hàng đã bị hủy");
        }

        // 3. Kiểm tra đã thanh toán chưa
        if (hoaDon.getTongTien() == null || hoaDon.getTongTien().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Đơn hàng chưa có thông tin thanh toán");
        }

        // 4. Tạo yêu cầu hoàn tiền
        String refundId = "REF-" + hoaDonId + "-" + System.currentTimeMillis();
        
        // TODO: Tích hợp với payment gateway để thực hiện hoàn tiền thực tế
        // Ví dụ: VNPay, MoMo, etc.
        
        // 5. Ghi log hoàn tiền
        log.info("Khởi tạo hoàn tiền cho đơn hàng {} do sự cố. " +
                "Số tiền: {}, Loại: {}, Incident ID: {}", 
                hoaDon.getMa(), hoaDon.getTongTien(), request.getRefundType(), request.getIncidentId());

        // 6. Tạo thông báo hoàn tiền
        ThongBao refundNotification = new ThongBao();
        refundNotification.setKhachHang(hoaDon.getTaiKhoan());
        refundNotification.setTieuDe("Thông báo hoàn tiền");
        refundNotification.setNoiDung(String.format(
                "Yêu cầu hoàn tiền cho đơn hàng #%s đã được xử lý. " +
                "Số tiền: %s VNĐ. Mã hoàn tiền: %s. " +
                "Thời gian xử lý dự kiến: 3-7 ngày làm việc.",
                hoaDon.getMa(), hoaDon.getTongTien(), refundId));
        refundNotification.setTrangThai(0); // Chưa đọc
        thongBaoRepository.save(refundNotification);

        return new IncidentRefundResponse(
                "PROCESSING",
                refundId,
                "Yêu cầu hoàn tiền đã được khởi tạo thành công",
                "3-7 ngày làm việc"
        );
    }

    /**
     * Hoàn kho hàng do sự cố vận chuyển
     */
    @Transactional
    public RestoreStockResponse restoreStockDueToIncident(Integer hoaDonId, RestoreStockIncidentRequest request) {
        // 1. Kiểm tra hóa đơn tồn tại
        HoaDon hoaDon = hoaDonRepository.findById(hoaDonId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hóa đơn"));

        // 2. Lấy danh sách sản phẩm trong đơn hàng
        List<HoaDonCT> orderDetails = hoaDonCTRepository.findByHoaDonId(hoaDonId);
        if (orderDetails.isEmpty()) {
            throw new IllegalArgumentException("Không tìm thấy sản phẩm trong đơn hàng");
        }

        int totalItemsRestored = 0;

        try {
            // 3. Hoàn kho cho từng sản phẩm
            for (HoaDonCT detail : orderDetails) {
                // Chỉ hoàn kho nếu sản phẩm chưa được hoàn trước đó
                if (detail.getSoLuong() > 0) {
                    // Gọi service hoàn kho
                    khoHangService.restoreStock(detail.getSanPhamCT().getId(), detail.getSoLuong());
                    totalItemsRestored += detail.getSoLuong();
                    
                    log.info("Đã hoàn kho {} sản phẩm {} do sự cố. Incident ID: {}", 
                            detail.getSoLuong(), detail.getSanPhamCT().getSanPham().getTen(), request.getIncidentId());
                }
            }

            // 4. Ghi log hoàn kho
            log.info("Hoàn kho thành công cho đơn hàng {} do sự cố. " +
                    "Tổng số lượng hoàn: {}, Loại: {}, Admin: {}", 
                    hoaDon.getMa(), totalItemsRestored, request.getRestoreType(), request.getAdminId());

            return new RestoreStockResponse(
                    "SUCCESS",
                    String.format("Đã hoàn kho thành công %d sản phẩm", totalItemsRestored),
                    totalItemsRestored
            );

        } catch (Exception e) {
            log.error("Lỗi khi hoàn kho cho đơn hàng {} do sự cố: {}", hoaDon.getMa(), e.getMessage());
            throw new RuntimeException("Không thể hoàn kho: " + e.getMessage());
        }
    }

    /**
     * Xác định có nên hoàn kho hay không dựa trên loại sự cố
     * CHỈ HOÀN KHO khi hàng còn nguyên vẹn và khách hàng không nhận
     */
    private boolean shouldRestoreStockForIncidentType(SuCoVanChuyen.LoaiSuCo loaiSuCo) {
        switch (loaiSuCo) {
            case KHONG_NHAN_HANG:
            case CHUA_NHAN_HANG:
                // CHỈ hoàn kho khi khách hàng không nhận/chưa nhận (hàng còn nguyên vẹn)
                log.info("Sẽ hoàn kho cho loại sự cố: {} (hàng còn nguyên vẹn)", loaiSuCo);
                return true;
            
            case HANG_BI_MAT:
            case HANG_BI_HONG:
            case SU_CO_VAN_CHUYEN:
            case KHAC:
                // KHÔNG hoàn kho cho các trường hợp hàng có thể bị ảnh hưởng
                log.info("KHÔNG hoàn kho cho loại sự cố: {} (hàng có thể bị ảnh hưởng/không khả dụng)", loaiSuCo);
                return false;
            
            default:
                // Mặc định KHÔNG hoàn kho để an toàn
                log.warn("Loại sự cố không xác định: {} - KHÔNG hoàn kho để an toàn", loaiSuCo);
                return false;
        }
    }

    /**
     * Cập nhật thông tin khách hàng vào hóa đơn
     */
    public HoaDon updateCustomerInfo(Integer idHoaDon, com.example.da_be.dto.CustomerInfoRequest request) {
        HoaDon hoaDon = hoaDonRepository.findById(idHoaDon)
                .orElseThrow(() -> new ResourceNotFoundException("Hóa đơn không tồn tại với id: " + idHoaDon));

        // Cập nhật thông tin khách hàng
        if (request.getIdUser() != null) {
            // Tạo một User proxy với chỉ ID để tránh lazy loading issues
            com.example.da_be.entity.User user = new com.example.da_be.entity.User();
            user.setId(request.getIdUser());
            hoaDon.setTaiKhoan(user);
        }
        
        if (request.getTenNguoiNhan() != null) {
            hoaDon.setTenNguoiNhan(request.getTenNguoiNhan());
        }
        
        if (request.getSdtNguoiNhan() != null) {
            hoaDon.setSdtNguoiNhan(request.getSdtNguoiNhan());
        }
        
        if (request.getEmailNguoiNhan() != null) {
            hoaDon.setEmailNguoiNhan(request.getEmailNguoiNhan());
        }

        hoaDon.setNgaySua(new Date());
        return hoaDonRepository.save(hoaDon);
    }

}

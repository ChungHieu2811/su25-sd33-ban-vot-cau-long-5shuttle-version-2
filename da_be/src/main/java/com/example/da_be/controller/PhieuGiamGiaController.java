package com.example.da_be.controller;

import com.example.da_be.dto.request.PhieuGiamGiaRequest;
import com.example.da_be.dto.request.PhieuGiamGiaSearch;
import com.example.da_be.dto.response.PhieuGiamGiaResponse;
import com.example.da_be.entity.PhieuGiamGia;
import com.example.da_be.service.PhieuGiamGiaService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.text.ParseException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
@RequestMapping("/api/phieu-giam-gia")
public class PhieuGiamGiaController {
    @Autowired
    private PhieuGiamGiaService phieuGiamGiaService;

    @GetMapping("/hien-thi")
    public List<PhieuGiamGiaResponse> getAllPhieuGiamGia() {
        return phieuGiamGiaService.getAllPhieuGiamGia();
    }

    @PostMapping("/add")
    public PhieuGiamGia addPhieuGiamGia(@RequestBody @Valid PhieuGiamGiaRequest phieuGiamGiaRequest) {
        return phieuGiamGiaService.addPhieuGiamGia(phieuGiamGiaRequest);
    }

    @DeleteMapping("/delete/{id}")
    public Boolean deletePhieuGiamGia(@PathVariable Integer id) {
        return phieuGiamGiaService.deletePhieuGiamGia(id);
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updatePhieuGiamGia(@PathVariable Integer id, @RequestBody PhieuGiamGiaRequest phieuGiamGiaRequest) {
        try {
            PhieuGiamGia result = phieuGiamGiaService.updatePhieuGiamGia(id, phieuGiamGiaRequest);
            if (result != null) {
                return ResponseEntity.ok(result);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (ParseException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Lỗi định dạng ngày tháng"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Lỗi hệ thống"));
        }
    }
    @GetMapping("/detail/{id}")
    public PhieuGiamGiaResponse getPhieuGiamGiaById(@PathVariable Integer id) {
        return phieuGiamGiaService.getPhieuGiamGiaById(id);
    }

    @GetMapping("/list-ma-phieu-giam-gia")
    public List<String> getAllMaPhieuGiamGia() {
        return phieuGiamGiaService.getAllMaPhieuGiamGia();
    }

    @GetMapping("/list-ten-phieu-giam-gia")
    public List<String> getAllTePhieuGiamGia() {
        return phieuGiamGiaService.getAllTenPhieuGiamGia();
    }

    @GetMapping("/search")
    public Map<String, Object> searchVouchers(
            @RequestParam(required = false) String tenSearch,
            @RequestParam(required = false) LocalDateTime ngayBatDauSearch,
            @RequestParam(required = false) LocalDateTime ngayKetThucSearch,
            @RequestParam(required = false) Integer kieuGiaTriSearch,
            @RequestParam(required = false) Integer trangThaiSearch,
            @RequestParam(value = "currentPage", defaultValue = "0") Integer currentPage,
            @RequestParam(value = "size", defaultValue = "5") Integer size) {


        PhieuGiamGiaSearch searchCriteria = new PhieuGiamGiaSearch();
        searchCriteria.setTenSearch(tenSearch);
        searchCriteria.setNgayBatDauSearch(ngayBatDauSearch);
        searchCriteria.setNgayKetThucSearch(ngayKetThucSearch);
        searchCriteria.setKieuGiaTriSearch(kieuGiaTriSearch);
        searchCriteria.setTrangThaiSearch(trangThaiSearch);

        // Khởi tạo Pageable cho phân trang
        Pageable pageable = PageRequest.of(currentPage, size);

        // Lấy kết quả từ service
        Page<PhieuGiamGiaResponse> pageResult = phieuGiamGiaService.getSearchPhieuGiamGia(searchCriteria, pageable);

        // Tạo response trả về cho client
        Map<String, Object> response = new HashMap<>();
        response.put("content", pageResult.getContent());
        response.put("totalPages", pageResult.getTotalPages());
        response.put("totalElements", pageResult.getTotalElements());
        response.put("currentPage", pageResult.getNumber());
        response.put("size", pageResult.getSize());

        return response;
    }
    
    @GetMapping("/check-availability/{id}")
    public ResponseEntity<?> checkVoucherAvailability(@PathVariable Integer id) {
        try {
            PhieuGiamGiaResponse voucher = phieuGiamGiaService.getPhieuGiamGiaById(id);
            
            Map<String, Object> availability = new HashMap<>();
            availability.put("id", voucher.getId());
            availability.put("ma", voucher.getMa());
            availability.put("ten", voucher.getTen());
            availability.put("soLuong", voucher.getSoLuong());
            availability.put("isAvailable", voucher.getSoLuong() > 0);
            availability.put("isValid", 
                voucher.getNgayBatDau().isBefore(LocalDateTime.now()) && 
                voucher.getNgayKetThuc().isAfter(LocalDateTime.now()) &&
                voucher.getTrangThai() == 1
            );
            
            return ResponseEntity.ok(availability);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Không tìm thấy phiếu giảm giá");
        }
    }

}


from sqlalchemy import Column, Integer, String, Date, ForeignKey, Float, DateTime, Enum as SqlEnum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class PurchaseStatus(str, enum.Enum):
    PENDING = "PENDING"     # 발주 대기
    ORDERED = "ORDERED"     # 발주 완료
    PARTIAL = "PARTIAL"     # 부분 입고
    COMPLETED = "COMPLETED" # 입고 완료
    CANCELED = "CANCELED"   # 취소됨

class OutsourcingStatus(str, enum.Enum):
    PENDING = "PENDING"     # 발주 대기
    ORDERED = "ORDERED"     # 발주 완료
    COMPLETED = "COMPLETED" # 작업 완료 (입고)
    CANCELED = "CANCELED"   # 취소됨

class PricingType(str, enum.Enum):
    UNIT = "UNIT"
    WEIGHT = "WEIGHT"

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True) # PO-YYYYMMDD-XXX
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    order_date = Column(Date, nullable=False)
    delivery_date = Column(Date, nullable=True)
    actual_delivery_date = Column(Date, nullable=True)
    total_amount = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    attachment_file = Column(Text, nullable=True)  # JSON array of {name, url}
    status = Column(SqlEnum(PurchaseStatus), default=PurchaseStatus.PENDING)
    purchase_type = Column(String, default="PART", nullable=True) # PART(부품), CONSUMABLE(소모품)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True)
    
    # Relationships
    partner = relationship("Partner", back_populates="purchase_orders")
    order = relationship("SalesOrder")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")

    @property
    def related_so_info_attr(self):
        codes = set()
        for item in self.items:
            if item.production_plan_item and item.production_plan_item.plan:
                plan = item.production_plan_item.plan
                if plan.order:
                    codes.add(plan.order.order_no)
                elif plan.stock_production:
                    codes.add(plan.stock_production.production_no)
            if getattr(item, 'material_requirement', None):
                req = item.material_requirement
                if req.order:
                    codes.add(req.order.order_no)
                elif req.plan:
                    if req.plan.order:
                        codes.add(req.plan.order.order_no)
                    elif req.plan.stock_production:
                        codes.add(req.plan.stock_production.production_no)
        return ", ".join(sorted(codes)) if codes else None

    @property
    def so_no_attr(self):
        return self.related_so_info_attr

    @property
    def related_cust_names_attr(self):
        names = set()
        for item in self.items:
            if item.production_plan_item and item.production_plan_item.plan:
                plan = item.production_plan_item.plan
                if plan.order and plan.order.partner:
                    names.add(plan.order.partner.name)
                elif plan.stock_production:
                    names.add("사내 재고용")
            if getattr(item, 'material_requirement', None):
                req = item.material_requirement
                if req.order and req.order.partner:
                    names.add(req.order.partner.name)
                elif req.plan:
                    if req.plan.order and req.plan.order.partner:
                        names.add(req.plan.order.partner.name)
                    elif req.plan.stock_production:
                        names.add("사내 재고용")
        return ", ".join(sorted(names)) if names else None

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=0)
    unit_price = Column(Float, default=0.0)
    received_quantity = Column(Integer, default=0) # 입고 수량
    note = Column(String, nullable=True)
    order_size = Column(String, nullable=True)
    material = Column(String, nullable=True)
    pricing_type = Column(SqlEnum(PricingType), default=PricingType.UNIT)
    total_weight = Column(Float, nullable=True)
    
    production_plan_item_id = Column(Integer, ForeignKey("production_plan_items.id"), nullable=True)
    material_requirement_id = Column(Integer, ForeignKey("material_requirements.id"), nullable=True)
    consumable_purchase_wait_id = Column(Integer, ForeignKey("consumable_purchase_waits.id"), nullable=True)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product")
    production_plan_item = relationship("ProductionPlanItem", back_populates="purchase_items") 
    material_requirement = relationship("MaterialRequirement")

class OutsourcingOrder(Base):
    __tablename__ = "outsourcing_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True) # OS-YYYYMMDD-XXX
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    order_date = Column(Date, nullable=False)
    delivery_date = Column(Date, nullable=True)
    actual_delivery_date = Column(Date, nullable=True)
    total_amount = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    attachment_file = Column(Text, nullable=True)  # JSON array of {name, url}
    status = Column(SqlEnum(OutsourcingStatus), default=OutsourcingStatus.PENDING)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True)
    
    # Relationships
    partner = relationship("Partner", back_populates="outsourcing_orders")
    order = relationship("SalesOrder")
    items = relationship("OutsourcingOrderItem", back_populates="outsourcing_order", cascade="all, delete-orphan")

    @property
    def related_so_info_attr(self):
        codes = set()
        for item in self.items:
            if item.production_plan_item and item.production_plan_item.plan:
                plan = item.production_plan_item.plan
                if plan.order:
                    codes.add(plan.order.order_no)
                elif plan.stock_production:
                    codes.add(plan.stock_production.production_no)
        return ", ".join(sorted(codes)) if codes else None

    @property
    def related_cust_names_attr(self):
        names = set()
        for item in self.items:
            if item.production_plan_item and item.production_plan_item.plan:
                plan = item.production_plan_item.plan
                if plan.order and plan.order.partner:
                    names.add(plan.order.partner.name)
                elif plan.stock_production:
                    names.add("사내 재고용")
        return ", ".join(sorted(names)) if names else None

class OutsourcingOrderItem(Base):
    __tablename__ = "outsourcing_order_items"

    id = Column(Integer, primary_key=True, index=True)
    outsourcing_order_id = Column(Integer, ForeignKey("outsourcing_orders.id"), nullable=False)
    production_plan_item_id = Column(Integer, ForeignKey("production_plan_items.id"), nullable=True) 
    # Link to specific process in production plan. Nullable if manual external order? 
    # Ideally linked.
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True) 
    # Redundant if linked to plan item, but good for manual orders.
    
    quantity = Column(Integer, default=0)
    unit_price = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    status = Column(SqlEnum(OutsourcingStatus), default=OutsourcingStatus.PENDING)
    pricing_type = Column(SqlEnum(PricingType), default=PricingType.UNIT)
    total_weight = Column(Float, nullable=True)

    # Relationships
    outsourcing_order = relationship("OutsourcingOrder", back_populates="items")
    production_plan_item = relationship("ProductionPlanItem", back_populates="outsourcing_items")
    product = relationship("Product")

class MaterialRequirement(Base):
    """자재 소요량/부족분 (MRP 결과 기록)"""
    __tablename__ = "material_requirements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True) # 어떤 수주 때문에 발생했는지
    plan_id = Column(Integer, ForeignKey("production_plans.id"), nullable=True) # 어떤 생산계획 때문에 발생했는지
    
    required_quantity = Column(Integer, nullable=False) # 총 필요량 (EXPLODED BOM * ORDER QTY)
    current_stock = Column(Integer, default=0) # 발생 시점의 재고 (참고용)
    open_purchase_qty = Column(Integer, default=0) # 발생 시점의 발주 잔량 (참고용)
    shortage_quantity = Column(Integer, nullable=False) # 실제 부족분 (계산 결과)
    
    status = Column(String, default="PENDING") # PENDING, ORDERED, CANCELLED
    created_at = Column(DateTime, default=func.now())
    
    product = relationship("Product")
    order = relationship("SalesOrder")
    plan = relationship("ProductionPlan", back_populates="material_requirements")

class ConsumablePurchaseWait(Base):
    """결재 완료된 소모품 신청 발주 대기 관리"""
    __tablename__ = "consumable_purchase_waits"

    id = Column(Integer, primary_key=True, index=True)
    approval_id = Column(Integer, ForeignKey("approval_documents.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    remarks = Column(String, nullable=True) # 용도/비고
    status = Column(String, default="PENDING") # PENDING 발주 대기, ORDERED 발주 완료, CANCELLED 취소됨
    created_at = Column(DateTime, default=func.now())

    # Relationships
    product = relationship("Product")
    approval_document = relationship("ApprovalDocument", foreign_keys=[approval_id])

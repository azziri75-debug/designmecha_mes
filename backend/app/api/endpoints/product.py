from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from sqlalchemy.orm import selectinload, joinedload
from typing import List

from app.api.deps import get_db
from app.models.product import Product, Process, ProductProcess
from app.schemas.product import ProductCreate, ProductResponse, ProcessCreate, ProcessResponse, ProductUpdate, ProcessUpdate

router = APIRouter()

# --- Process Endpoints ---
@router.post("/processes/", response_model=ProcessResponse)
async def create_process(
    process: ProcessCreate,
    db: AsyncSession = Depends(get_db)
):
    new_process = Process(**process.model_dump())
    db.add(new_process)
    await db.commit()
    await db.refresh(new_process)
    return new_process

@router.get("/processes/", response_model=List[ProcessResponse])
async def read_processes(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Process).offset(skip).limit(limit))
    processes = result.scalars().all()
    return processes

# --- Product Endpoints ---
@router.post("/products/", response_model=ProductResponse)
async def create_product(
    product: ProductCreate,
    db: AsyncSession = Depends(get_db)
):
    # 1. Create Product
    product_data = product.model_dump(exclude={"standard_processes"})
    new_product = Product(**product_data)
    db.add(new_product)
    await db.flush() # ID generation

    # 2. Add Standard Processes (Routing)
    for pp in product.standard_processes:
        new_pp = ProductProcess(
            product_id=new_product.id,
            process_id=pp.process_id,
            sequence=pp.sequence,
            estimated_time=pp.estimated_time,
            notes=pp.notes,
            partner_name=pp.partner_name,
            equipment_name=pp.equipment_name,
            attachment_file=pp.attachment_file,
            course_type=pp.course_type
        )
        db.add(new_pp)

    await db.commit()
    await db.commit()
    # Re-fetch the product with eager loading to avoid MissingGreenlet error on response serialization
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).joinedload(ProductProcess.process)
        )
        .where(Product.id == new_product.id)
    )
    created_product = result.scalar_one()
    return created_product

@router.get("/products/", response_model=List[ProductResponse])
async def read_products(
    skip: int = 0,
    limit: int = 100,
    partner_id: int = None,
    db: AsyncSession = Depends(get_db)
):
    # Eager loading needed for standard_processes AND its nested process relationship
    query = select(Product).options(
        selectinload(Product.standard_processes).joinedload(ProductProcess.process)
    )
    
    if partner_id:
        query = query.where(Product.partner_id == partner_id)
        
    
    result = await db.execute(query.offset(skip).limit(limit))
    products = result.scalars().all()
    return products

@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_update: ProductUpdate,
    db: AsyncSession = Depends(get_db)
):
    # Ensure checking existing product also loads relationships if needed (though strictly for check only ID is needed)
    # But for update we don't strictly one it here, we reuse scalar_one_or_none
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = product_update.model_dump(exclude_unset=True)
    
    # Handle standard_processes update if provided
    if "standard_processes" in update_data:
        processes_data = update_data.pop("standard_processes")
        
        # Clear existing processes
        # Note: This is a full replacement strategy.
        # Efficient for small lists, but for large ones we might need diffing.
        # Given 15-person company scale, replacement is fine.
        # Add new processes
        # First, delete existing ones
        await db.execute(delete(ProductProcess).where(ProductProcess.product_id == product_id))
        
        # Add new processes
        for pp in processes_data:
            new_pp = ProductProcess(
                product_id=product_id,
                process_id=pp['process_id'],
                sequence=pp['sequence'],
                estimated_time=pp.get('estimated_time'),
                notes=pp.get('notes'),
                partner_name=pp.get('partner_name'),
                equipment_name=pp.get('equipment_name'),
                attachment_file=pp.get('attachment_file'),
                course_type=pp.get('course_type')
            )
            db.add(new_pp)
            
    # Update other fields
    for key, value in update_data.items():
        setattr(product, key, value)
        
    await db.commit()
    
    # Re-fetch with eager load
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).joinedload(ProductProcess.process)
        )
        .where(Product.id == product_id)
    )
    updated_product = result.scalar_one()
    return updated_product

@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    await db.delete(product)
    await db.commit()
    return {"message": "Product deleted successfully"}

# --- Process CRUD Operations ---

@router.put("/processes/{process_id}", response_model=ProcessResponse)
async def update_process(
    process_id: int,
    process_update: ProcessUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Process).where(Process.id == process_id))
    process_obj = result.scalar_one_or_none()
    if not process_obj:
        raise HTTPException(status_code=404, detail="Process not found")
        
    for key, value in process_update.model_dump(exclude_unset=True).items():
        setattr(process_obj, key, value)
        
    await db.commit()
    await db.refresh(process_obj)
    return process_obj

@router.delete("/processes/{process_id}")
async def delete_process(
    process_id: int,
    db: AsyncSession = Depends(get_db)
):
    # Check if used in any product
    # verification logic needed
    # For now, let's allow delete and let FK constraints handle it (if set) or check manually
    
    result = await db.execute(select(Process).where(Process.id == process_id))
    process_obj = result.scalar_one_or_none()
    if not process_obj:
        raise HTTPException(status_code=404, detail="Process not found")
    
    try:
        await db.delete(process_obj)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Cannot delete process. It might be in use. Error: {str(e)}")
        
    return {"message": "Process deleted successfully"}

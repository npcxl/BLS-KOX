import { Context } from "koa";
import { z } from "zod";
import { ValidationError } from "../../core/errors";
import { getAuditActor, writeOperationLog } from "../../core/audit";
import { getCurrentTenantId } from "../../middleware/tenant";
import { pageSuccess, success } from "../../core/response";
import { BusinessRepository } from "./business.repository";
import { BusinessService } from "./business.service";

const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
    keyword: z.string().optional(),
  })
  .passthrough();

function idsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  if (typeof value === "number") return [String(value)];
  return [];
}

function buildCrud<T extends z.ZodRawShape>(shape: T) {
  const create = z.object(shape);
  return { create, edit: create.extend({ id: z.string().min(1) }) };
}

function mapInput(input: Record<string, unknown>): Record<string, unknown> {
  return input;
}

function repo<T extends Record<string, unknown>>(cfg: ConstructorParameters<typeof BusinessRepository<T>>[0]) {
  return new BusinessRepository<T>(cfg as any);
}

export class BusinessController {
  private readonly productionLineService = new BusinessService(
    repo<any>({
      key: "productionLine",
      tableName: "biz_production_line",
      idColumn: "line_id",
      tenantAware: true,
      searchColumns: [
        "line_code",
        "line_name",
        "workshop_name",
        "main_product",
      ],
      listColumns: [
        "line_id as id",
        "line_code as lineCode",
        "line_name as lineName",
        "workshop_name as workshopName",
        "line_type as lineType",
        "main_product as mainProduct",
        "line_manager as lineManager",
        "shift_type as shiftType",
        "daily_capacity as dailyCapacity",
        "current_capacity as currentCapacity",
        "equipment_count as equipmentCount",
        "worker_count as workerCount",
        "yield_rate as yieldRate",
        "utilization_rate as utilizationRate",
        "status",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "line_id as id",
        "line_code as lineCode",
        "line_name as lineName",
        "workshop_name as workshopName",
        "line_type as lineType",
        "main_product as mainProduct",
        "line_manager as lineManager",
        "shift_type as shiftType",
        "daily_capacity as dailyCapacity",
        "current_capacity as currentCapacity",
        "equipment_count as equipmentCount",
        "worker_count as workerCount",
        "yield_rate as yieldRate",
        "utilization_rate as utilizationRate",
        "status",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "line_code",
        "line_name",
        "workshop_name",
        "line_type",
        "main_product",
        "line_manager",
        "shift_type",
        "daily_capacity",
        "current_capacity",
        "equipment_count",
        "worker_count",
        "yield_rate",
        "utilization_rate",
        "status",
        "remark",
      ],
      updateColumns: [
        "line_code",
        "line_name",
        "workshop_name",
        "line_type",
        "main_product",
        "line_manager",
        "shift_type",
        "daily_capacity",
        "current_capacity",
        "equipment_count",
        "worker_count",
        "yield_rate",
        "utilization_rate",
        "status",
        "remark",
      ],
      dateColumn: "created_at",
      mapInput,
    }),
  );

  private readonly productService = new BusinessService(
    repo<any>({
      key: "product",
      tableName: "biz_product",
      idColumn: "product_id",
      tenantAware: true,
      searchColumns: [
        "product_code",
        "product_name",
        "product_model",
        "category_name",
      ],
      listColumns: [
        "product_id as id",
        "product_code as productCode",
        "product_name as productName",
        "product_model as productModel",
        "category_name as categoryName",
        "unit",
        "standard_price as standardPrice",
        "cost_price as costPrice",
        "safety_stock as safetyStock",
        "product_status as productStatus",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "product_id as id",
        "product_code as productCode",
        "product_name as productName",
        "product_model as productModel",
        "category_name as categoryName",
        "unit",
        "standard_price as standardPrice",
        "cost_price as costPrice",
        "safety_stock as safetyStock",
        "product_status as productStatus",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "product_code",
        "product_name",
        "product_model",
        "category_name",
        "unit",
        "standard_price",
        "cost_price",
        "safety_stock",
        "product_status",
        "remark",
      ],
      updateColumns: [
        "product_code",
        "product_name",
        "product_model",
        "category_name",
        "unit",
        "standard_price",
        "cost_price",
        "safety_stock",
        "product_status",
        "remark",
      ],
      mapInput,
    }),
  );

  private readonly orderService = new BusinessService(
    repo<any>({
      key: "order",
      tableName: "biz_order",
      idColumn: "order_id",
      tenantAware: true,
      searchColumns: [
        "order_no",
        "customer_name",
        "product_code",
        "product_name",
      ],
      listColumns: [
        "order_id as id",
        "order_no as orderNo",
        "customer_name as customerName",
        "customer_contact as customerContact",
        "customer_phone as customerPhone",
        "order_source as orderSource",
        "order_date as orderDate",
        "delivery_date as deliveryDate",
        "product_code as productCode",
        "product_name as productName",
        "order_quantity as orderQuantity",
        "unit_price as unitPrice",
        "total_amount as totalAmount",
        "order_status as orderStatus",
        "payment_status as paymentStatus",
        "sales_owner as salesOwner",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "order_id as id",
        "order_no as orderNo",
        "customer_name as customerName",
        "customer_contact as customerContact",
        "customer_phone as customerPhone",
        "order_source as orderSource",
        "order_date as orderDate",
        "delivery_date as deliveryDate",
        "product_code as productCode",
        "product_name as productName",
        "order_quantity as orderQuantity",
        "unit_price as unitPrice",
        "total_amount as totalAmount",
        "order_status as orderStatus",
        "payment_status as paymentStatus",
        "sales_owner as salesOwner",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "order_no",
        "customer_name",
        "customer_contact",
        "customer_phone",
        "order_source",
        "order_date",
        "delivery_date",
        "product_code",
        "product_name",
        "order_quantity",
        "unit_price",
        "total_amount",
        "order_status",
        "payment_status",
        "sales_owner",
        "remark",
      ],
      updateColumns: [
        "order_no",
        "customer_name",
        "customer_contact",
        "customer_phone",
        "order_source",
        "order_date",
        "delivery_date",
        "product_code",
        "product_name",
        "order_quantity",
        "unit_price",
        "total_amount",
        "order_status",
        "payment_status",
        "sales_owner",
        "remark",
      ],
      mapInput,
    }),
  );

  private readonly financeService = new BusinessService(
    repo<any>({
      key: "financeRecord",
      tableName: "biz_finance_record",
      idColumn: "finance_id",
      tenantAware: true,
      searchColumns: [
        "record_no",
        "counterparty",
        "business_type",
        "related_no",
      ],
      listColumns: [
        "finance_id as id",
        "record_no as recordNo",
        "record_type as recordType",
        "business_type as businessType",
        "related_no as relatedNo",
        "counterparty",
        "amount",
        "tax_amount as taxAmount",
        "record_date as recordDate",
        "payment_method as paymentMethod",
        "audit_status as auditStatus",
        "handler",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "finance_id as id",
        "record_no as recordNo",
        "record_type as recordType",
        "business_type as businessType",
        "related_no as relatedNo",
        "counterparty",
        "amount",
        "tax_amount as taxAmount",
        "record_date as recordDate",
        "payment_method as paymentMethod",
        "audit_status as auditStatus",
        "handler",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "record_no",
        "record_type",
        "business_type",
        "related_no",
        "counterparty",
        "amount",
        "tax_amount",
        "record_date",
        "payment_method",
        "audit_status",
        "handler",
        "remark",
      ],
      updateColumns: [
        "record_no",
        "record_type",
        "business_type",
        "related_no",
        "counterparty",
        "amount",
        "tax_amount",
        "record_date",
        "payment_method",
        "audit_status",
        "handler",
        "remark",
      ],
      mapInput,
    }),
  );

  private readonly salesService = new BusinessService(
    repo<any>({
      key: "salesRecord",
      tableName: "biz_sales_record",
      idColumn: "sales_id",
      tenantAware: true,
      searchColumns: [
        "sales_no",
        "customer_name",
        "product_code",
        "product_name",
      ],
      filterColumns: {
        deliveryStatus: "delivery_status",
        invoiceStatus: "invoice_status",
      },
      listColumns: [
        "sales_id as id",
        "sales_no as salesNo",
        "order_no as orderNo",
        "customer_name as customerName",
        "product_code as productCode",
        "product_name as productName",
        "sales_quantity as salesQuantity",
        "unit_price as unitPrice",
        "sales_amount as salesAmount",
        "sales_date as salesDate",
        "sales_region as salesRegion",
        "sales_channel as salesChannel",
        "sales_owner as salesOwner",
        "delivery_status as deliveryStatus",
        "invoice_status as invoiceStatus",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "sales_id as id",
        "sales_no as salesNo",
        "order_no as orderNo",
        "customer_name as customerName",
        "product_code as productCode",
        "product_name as productName",
        "sales_quantity as salesQuantity",
        "unit_price as unitPrice",
        "sales_amount as salesAmount",
        "sales_date as salesDate",
        "sales_region as salesRegion",
        "sales_channel as salesChannel",
        "sales_owner as salesOwner",
        "delivery_status as deliveryStatus",
        "invoice_status as invoiceStatus",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "sales_no",
        "order_no",
        "customer_name",
        "product_code",
        "product_name",
        "sales_quantity",
        "unit_price",
        "sales_amount",
        "sales_date",
        "sales_region",
        "sales_channel",
        "sales_owner",
        "delivery_status",
        "invoice_status",
        "remark",
      ],
      updateColumns: [
        "sales_no",
        "order_no",
        "customer_name",
        "product_code",
        "product_name",
        "sales_quantity",
        "unit_price",
        "sales_amount",
        "sales_date",
        "sales_region",
        "sales_channel",
        "sales_owner",
        "delivery_status",
        "invoice_status",
        "remark",
      ],
      mapInput,
    }),
  );

  private readonly inventoryService = new BusinessService(
    repo<any>({
      key: "inventory",
      tableName: "biz_inventory",
      idColumn: "inventory_id",
      tenantAware: true,
      searchColumns: [
        "warehouse_code",
        "warehouse_name",
        "location_code",
        "product_code",
        "product_name",
        "batch_no",
      ],
      listColumns: [
        "inventory_id as id",
        "warehouse_code as warehouseCode",
        "warehouse_name as warehouseName",
        "location_code as locationCode",
        "product_code as productCode",
        "product_name as productName",
        "batch_no as batchNo",
        "available_qty as availableQty",
        "locked_qty as lockedQty",
        "in_transit_qty as inTransitQty",
        "safety_stock as safetyStock",
        "inventory_status as inventoryStatus",
        "last_inbound_date as lastInboundDate",
        "last_outbound_date as lastOutboundDate",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      detailColumns: [
        "inventory_id as id",
        "warehouse_code as warehouseCode",
        "warehouse_name as warehouseName",
        "location_code as locationCode",
        "product_code as productCode",
        "product_name as productName",
        "batch_no as batchNo",
        "available_qty as availableQty",
        "locked_qty as lockedQty",
        "in_transit_qty as inTransitQty",
        "safety_stock as safetyStock",
        "inventory_status as inventoryStatus",
        "last_inbound_date as lastInboundDate",
        "last_outbound_date as lastOutboundDate",
        "remark",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ],
      createColumns: [
        "warehouse_code",
        "warehouse_name",
        "location_code",
        "product_code",
        "product_name",
        "batch_no",
        "available_qty",
        "locked_qty",
        "in_transit_qty",
        "safety_stock",
        "inventory_status",
        "last_inbound_date",
        "last_outbound_date",
        "remark",
      ],
      updateColumns: [
        "warehouse_code",
        "warehouse_name",
        "location_code",
        "product_code",
        "product_name",
        "batch_no",
        "available_qty",
        "locked_qty",
        "in_transit_qty",
        "safety_stock",
        "inventory_status",
        "last_inbound_date",
        "last_outbound_date",
        "remark",
      ],
      mapInput,
    }),
  );

  private async list(
    ctx: Context,
    service: BusinessService<any>,
  ): Promise<void> {
    const query = pageQuerySchema.parse(ctx.query) as Record<string, unknown>;
    const result = await service.list(query);
    pageSuccess(ctx, result.rows, result.total);
  }

  private async detail(
    ctx: Context,
    service: BusinessService<any>,
  ): Promise<void> {
    success(ctx, await service.detail(String(ctx.params.id)), "查询成功");
  }

  private async add(
    ctx: Context,
    service: BusinessService<any>,
    schema: z.ZodObject<any>,
    title: string,
  ): Promise<void> {
    const parsed = schema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.flatten());
    const id = await service.add(parsed.data);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "business",
      businessType: "ADD",
      title,
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify(parsed.data),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, { id }, "新增成功");
  }

  private async edit(
    ctx: Context,
    service: BusinessService<any>,
    schema: z.ZodObject<any>,
    title: string,
  ): Promise<void> {
    const body = ctx.request.body as Record<string, unknown>;
    const parsed = schema.safeParse({
      ...body,
      id:
        body.id ??
        body.lineId ??
        body.productId ??
        body.orderId ??
        body.financeId ??
        body.salesId ??
        body.inventoryId,
    });
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.flatten());
    await service.edit(String(parsed.data.id), parsed.data);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "business",
      businessType: "UPDATE",
      title,
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify(parsed.data),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "修改成功");
  }

  private async remove(
    ctx: Context,
    service: BusinessService<any>,
    title: string,
  ): Promise<void> {
    const bodyIds = (ctx.request.body as { ids?: unknown } | undefined)?.ids;
    const ids = idsFrom(ctx.query.ids ?? bodyIds);
    await service.remove(ids);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "business",
      businessType: "DELETE",
      title,
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify({ ids }),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "删除成功");
  }

  private readonly lineSchema = buildCrud({
    lineCode: z.string().min(1),
    lineName: z.string().min(1),
    workshopName: z.string().min(1),
    lineType: z.string().optional(),
    mainProduct: z.string().optional(),
    lineManager: z.string().optional(),
    shiftType: z.string().optional(),
    dailyCapacity: z.coerce.number().int().optional(),
    currentCapacity: z.coerce.number().int().optional(),
    equipmentCount: z.coerce.number().int().optional(),
    workerCount: z.coerce.number().int().optional(),
    yieldRate: z.coerce.number().optional(),
    utilizationRate: z.coerce.number().optional(),
    status: z.string().optional(),
    remark: z.string().optional(),
  });
  private readonly productSchema = buildCrud({
    productCode: z.string().min(1),
    productName: z.string().min(1),
    productModel: z.string().optional(),
    categoryName: z.string().optional(),
    unit: z.string().optional(),
    standardPrice: z.coerce.number().optional(),
    costPrice: z.coerce.number().optional(),
    safetyStock: z.coerce.number().int().optional(),
    productStatus: z.string().optional(),
    remark: z.string().optional(),
  });
  private readonly orderSchema = buildCrud({
    orderNo: z.string().min(1),
    customerName: z.string().min(1),
    customerContact: z.string().optional(),
    customerPhone: z.string().optional(),
    orderSource: z.string().optional(),
    orderDate: z.string().min(1),
    deliveryDate: z.string().optional(),
    productCode: z.string().optional(),
    productName: z.string().optional(),
    orderQuantity: z.coerce.number().int().optional(),
    unitPrice: z.coerce.number().optional(),
    totalAmount: z.coerce.number().optional(),
    orderStatus: z.string().optional(),
    paymentStatus: z.string().optional(),
    salesOwner: z.string().optional(),
    remark: z.string().optional(),
  });
  private readonly financeSchema = buildCrud({
    recordNo: z.string().min(1),
    recordType: z.string().min(1),
    businessType: z.string().optional(),
    relatedNo: z.string().optional(),
    counterparty: z.string().optional(),
    amount: z.coerce.number().optional(),
    taxAmount: z.coerce.number().optional(),
    recordDate: z.string().min(1),
    paymentMethod: z.string().optional(),
    auditStatus: z.string().optional(),
    handler: z.string().optional(),
    remark: z.string().optional(),
  });
  private readonly salesSchema = buildCrud({
    salesNo: z.string().min(1),
    orderNo: z.string().optional(),
    customerName: z.string().min(1),
    productCode: z.string().min(1),
    productName: z.string().min(1),
    salesQuantity: z.coerce.number().int().optional(),
    unitPrice: z.coerce.number().optional(),
    salesAmount: z.coerce.number().optional(),
    salesDate: z.string().min(1),
    salesRegion: z.string().optional(),
    salesChannel: z.string().optional(),
    salesOwner: z.string().optional(),
    deliveryStatus: z.string().optional(),
    invoiceStatus: z.string().optional(),
    remark: z.string().optional(),
  });
  private readonly inventorySchema = buildCrud({
    warehouseCode: z.string().min(1),
    warehouseName: z.string().min(1),
    locationCode: z.string().optional(),
    productCode: z.string().min(1),
    productName: z.string().min(1),
    batchNo: z.string().optional(),
    availableQty: z.coerce.number().int().optional(),
    lockedQty: z.coerce.number().int().optional(),
    inTransitQty: z.coerce.number().int().optional(),
    safetyStock: z.coerce.number().int().optional(),
    inventoryStatus: z.string().optional(),
    lastInboundDate: z.string().optional(),
    lastOutboundDate: z.string().optional(),
    remark: z.string().optional(),
  });

  productionLineList = (ctx: Context) =>
    this.list(ctx, this.productionLineService);
  productionLineDetail = (ctx: Context) =>
    this.detail(ctx, this.productionLineService);
  productionLineAdd = (ctx: Context) =>
    this.add(
      ctx,
      this.productionLineService,
      this.lineSchema.create,
      "新增生产线",
    );
  productionLineEdit = (ctx: Context) =>
    this.edit(
      ctx,
      this.productionLineService,
      this.lineSchema.edit,
      "修改生产线",
    );
  productionLineRemove = (ctx: Context) =>
    this.remove(ctx, this.productionLineService, "删除生产线");

  productList = (ctx: Context) => this.list(ctx, this.productService);
  productDetail = (ctx: Context) => this.detail(ctx, this.productService);
  productAdd = (ctx: Context) =>
    this.add(ctx, this.productService, this.productSchema.create, "新增产品");
  productEdit = (ctx: Context) =>
    this.edit(ctx, this.productService, this.productSchema.edit, "修改产品");
  productRemove = (ctx: Context) =>
    this.remove(ctx, this.productService, "删除产品");

  orderList = (ctx: Context) => this.list(ctx, this.orderService);
  orderDetail = (ctx: Context) => this.detail(ctx, this.orderService);
  orderAdd = (ctx: Context) =>
    this.add(ctx, this.orderService, this.orderSchema.create, "新增订单");
  orderEdit = (ctx: Context) =>
    this.edit(ctx, this.orderService, this.orderSchema.edit, "修改订单");
  orderRemove = (ctx: Context) =>
    this.remove(ctx, this.orderService, "删除订单");

  financeList = (ctx: Context) => this.list(ctx, this.financeService);
  financeDetail = (ctx: Context) => this.detail(ctx, this.financeService);
  financeAdd = (ctx: Context) =>
    this.add(
      ctx,
      this.financeService,
      this.financeSchema.create,
      "新增财务记录",
    );
  financeEdit = (ctx: Context) =>
    this.edit(
      ctx,
      this.financeService,
      this.financeSchema.edit,
      "修改财务记录",
    );
  financeRemove = (ctx: Context) =>
    this.remove(ctx, this.financeService, "删除财务记录");

  salesList = (ctx: Context) => this.list(ctx, this.salesService);
  salesDetail = (ctx: Context) => this.detail(ctx, this.salesService);
  salesAdd = (ctx: Context) =>
    this.add(ctx, this.salesService, this.salesSchema.create, "新增销售记录");
  salesEdit = (ctx: Context) =>
    this.edit(ctx, this.salesService, this.salesSchema.edit, "修改销售记录");
  salesRemove = (ctx: Context) =>
    this.remove(ctx, this.salesService, "删除销售记录");

  inventoryList = (ctx: Context) => this.list(ctx, this.inventoryService);
  inventoryDetail = (ctx: Context) => this.detail(ctx, this.inventoryService);
  inventoryAdd = (ctx: Context) =>
    this.add(
      ctx,
      this.inventoryService,
      this.inventorySchema.create,
      "新增库存",
    );
  inventoryEdit = (ctx: Context) =>
    this.edit(
      ctx,
      this.inventoryService,
      this.inventorySchema.edit,
      "修改库存",
    );
  inventoryRemove = (ctx: Context) =>
    this.remove(ctx, this.inventoryService, "删除库存");
}

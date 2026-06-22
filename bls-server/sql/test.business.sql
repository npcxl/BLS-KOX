SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS biz_production_line;
DROP TABLE IF EXISTS biz_order;
DROP TABLE IF EXISTS biz_product;
DROP TABLE IF EXISTS biz_finance_record;
DROP TABLE IF EXISTS biz_sales_record;
DROP TABLE IF EXISTS biz_inventory;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- 1. 生产流水线管理
-- =====================================================

CREATE TABLE biz_production_line (
  line_id varchar(32) NOT NULL COMMENT '流水线ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  line_code varchar(64) NOT NULL COMMENT '流水线编码',
  line_name varchar(100) NOT NULL COMMENT '流水线名称',
  workshop_name varchar(100) NOT NULL COMMENT '所属车间',
  line_type varchar(50) DEFAULT NULL COMMENT '产线类型',
  main_product varchar(100) DEFAULT NULL COMMENT '主要生产产品',

  line_manager varchar(50) DEFAULT NULL COMMENT '产线负责人',
  shift_type varchar(50) DEFAULT NULL COMMENT '班次类型',
  daily_capacity int DEFAULT 0 COMMENT '设计日产能',
  current_capacity int DEFAULT 0 COMMENT '当前日产量',

  equipment_count int DEFAULT 0 COMMENT '设备数量',
  worker_count int DEFAULT 0 COMMENT '作业人数',
  yield_rate decimal(5,2) DEFAULT 0 COMMENT '良品率',
  utilization_rate decimal(5,2) DEFAULT 0 COMMENT '稼动率',

  status varchar(20) DEFAULT 'running' COMMENT '状态：running运行中 maintenance维护中 stopped停线 idle空闲',
  remark varchar(255) DEFAULT NULL COMMENT '备注',

  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (line_id),
  UNIQUE KEY uk_line_tenant_code (tenant_id, line_code),
  KEY idx_line_tenant_status (tenant_id, status),
  KEY idx_line_workshop (tenant_id, workshop_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产流水线管理表';


INSERT INTO biz_production_line
(line_id, tenant_id, line_code, line_name, workshop_name, line_type, main_product, line_manager, shift_type, daily_capacity, current_capacity, equipment_count, worker_count, yield_rate, utilization_rate, status, remark, created_by)
VALUES
('PL0001','000001','LINE-SMT-01','SMT贴片一线','电子装配一车间','SMT贴片线','智能控制主板','王建国','两班倒',12000,10860,18,26,98.72,91.35,'running','主要承接控制板批量贴装任务','U0001'),
('PL0002','000001','LINE-SMT-02','SMT贴片二线','电子装配一车间','SMT贴片线','传感器采集板','李志强','两班倒',10000,9230,16,24,98.41,88.60,'running','近期订单稳定，夜班产能略有波动','U0001'),
('PL0003','000001','LINE-DIP-01','DIP插件一线','电子装配二车间','插件焊接线','电源控制模块','赵海峰','两班倒',6500,5980,12,32,97.85,86.42,'running','插件岗位人员已满编','U0002'),
('PL0004','000001','LINE-DIP-02','DIP插件二线','电子装配二车间','插件焊接线','通讯扩展模块','陈晓东','白班',5200,4360,10,25,97.12,80.26,'running','部分工位需补充治具','U0002'),
('PL0005','000001','LINE-ASSY-01','整机装配一线','总装一车间','整机装配线','工业数据采集终端','刘春明','两班倒',1800,1650,22,45,99.10,92.18,'running','核心交付产线，优先保障物料','U0003'),
('PL0006','000001','LINE-ASSY-02','整机装配二线','总装一车间','整机装配线','智能网关设备','孙立军','两班倒',1600,1425,20,41,98.96,89.54,'running','本周切换新工艺版本','U0003'),
('PL0007','000001','LINE-TEST-01','功能测试一线','测试中心','功能测试线','工业网关成品测试','周永亮','两班倒',2200,2045,28,30,99.42,93.70,'running','自动测试工装运行正常','U0004'),
('PL0008','000001','LINE-TEST-02','老化测试二线','测试中心','老化测试线','传感器老化测试','马建平','三班倒',3500,3180,36,18,99.05,87.92,'running','高温老化箱已完成点检','U0004'),
('PL0009','000001','LINE-PACK-01','包装一线','包装车间','包装线','标准成品包装','杨磊','白班',3000,2860,8,22,99.60,94.20,'running','包装耗材库存充足','U0005'),
('PL0010','000001','LINE-PACK-02','包装二线','包装车间','包装线','出口订单包装','胡凯','白班',2400,1980,7,20,99.30,81.44,'running','出口标签需人工复核','U0005'),
('PL0011','000001','LINE-CNC-01','CNC精加工一线','机加工车间','CNC加工线','铝合金外壳','蒋国华','两班倒',4200,3860,15,19,96.85,88.75,'running','刀具寿命需加强跟踪','U0006'),
('PL0012','000001','LINE-CNC-02','CNC精加工二线','机加工车间','CNC加工线','散热器结构件','许文斌','两班倒',3800,3260,14,17,96.20,79.60,'maintenance','主轴保养中，预计今晚恢复','U0006'),
('PL0013','000001','LINE-INJ-01','注塑一线','注塑车间','注塑线','ABS塑胶外壳','黄志远','三班倒',9000,8420,10,16,97.50,90.80,'running','模温机运行稳定','U0007'),
('PL0014','000001','LINE-INJ-02','注塑二线','注塑车间','注塑线','阻燃端子外壳','郭明','三班倒',7800,6950,9,15,96.90,84.35,'running','夜班换模频率较高','U0007'),
('PL0015','000001','LINE-SPRAY-01','喷涂一线','表面处理车间','喷涂线','金属外壳喷涂','曹旭','白班',3600,2980,11,21,95.60,76.40,'maintenance','喷房过滤棉更换中','U0008'),
('PL0016','000001','LINE-LASER-01','激光打标一线','包装车间','标识打码线','产品铭牌打标','魏强','白班',5200,4870,6,10,99.80,93.50,'running','二维码识别率稳定','U0008'),
('PL0017','000001','LINE-QC-01','来料检验线','品质中心','质检线','电子元器件检验','沈丽','白班',15000,13600,12,28,98.20,85.10,'running','重点检验芯片与连接器','U0009'),
('PL0018','000001','LINE-QC-02','成品抽检线','品质中心','质检线','成品可靠性抽检','邹洁','白班',2600,2310,9,16,99.15,88.00,'running','本月客诉批次加严抽检','U0009'),
('PL0019','000001','LINE-REPAIR-01','返修分析线','维修中心','返修线','异常品分析维修','方涛','白班',600,430,8,12,92.40,68.30,'idle','等待上一批异常品复判','U0010'),
('PL0020','000001','LINE-AUTO-01','自动化装配试验线','智能制造试验区','自动化试产线','新款边缘计算盒','韩启明','白班',900,520,24,8,96.30,58.40,'running','新产品小批量试产阶段','U0010');


-- =====================================================
-- 2. 产品管理
-- =====================================================

CREATE TABLE biz_product (
  product_id varchar(32) NOT NULL COMMENT '产品ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  product_code varchar(64) NOT NULL COMMENT '产品编码',
  product_name varchar(120) NOT NULL COMMENT '产品名称',
  product_model varchar(100) DEFAULT NULL COMMENT '规格型号',
  category_name varchar(80) DEFAULT NULL COMMENT '产品分类',
  unit varchar(20) DEFAULT '台' COMMENT '单位',

  standard_price decimal(12,2) DEFAULT 0 COMMENT '标准售价',
  cost_price decimal(12,2) DEFAULT 0 COMMENT '成本价',
  safety_stock int DEFAULT 0 COMMENT '安全库存',
  product_status varchar(20) DEFAULT 'active' COMMENT '状态：active启用 inactive停用 trial试产',

  remark varchar(255) DEFAULT NULL,
  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (product_id),
  UNIQUE KEY uk_product_tenant_code (tenant_id, product_code),
  KEY idx_product_tenant_category (tenant_id, category_name),
  KEY idx_product_tenant_status (tenant_id, product_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品管理表';


INSERT INTO biz_product
(product_id, tenant_id, product_code, product_name, product_model, category_name, unit, standard_price, cost_price, safety_stock, product_status, remark, created_by)
VALUES
('PRD0001','000001','PRD-GW-1001','工业物联网网关','GW-1001-4G','工业网关','台',1280.00,760.00,300,'active','支持4G联网和Modbus协议','U0001'),
('PRD0002','000001','PRD-GW-1002','工业物联网网关 Pro','GW-1002-5G','工业网关','台',1980.00,1160.00,200,'active','支持5G、以太网和边缘计算','U0001'),
('PRD0003','000001','PRD-PLC-2100','小型PLC控制器','PLC-2100-16DI','控制器','台',860.00,510.00,250,'active','适用于中小型自动化设备','U0002'),
('PRD0004','000001','PRD-PLC-2200','高性能PLC控制器','PLC-2200-32DI','控制器','台',1460.00,890.00,180,'active','支持高速脉冲与扩展IO','U0002'),
('PRD0005','000001','PRD-SEN-3101','温湿度采集传感器','SEN-3101-RS485','传感器','只',168.00,82.00,800,'active','车间环境监测常用型号','U0003'),
('PRD0006','000001','PRD-SEN-3201','振动监测传感器','SEN-3201-MEMS','传感器','只',420.00,238.00,500,'active','用于设备预测性维护','U0003'),
('PRD0007','000001','PRD-PWR-4101','24V工业电源模块','PWR-4101-120W','电源模块','个',236.00,132.00,600,'active','标准导轨安装电源','U0004'),
('PRD0008','000001','PRD-PWR-4201','48V工业电源模块','PWR-4201-240W','电源模块','个',398.00,225.00,450,'active','适用于大功率控制柜','U0004'),
('PRD0009','000001','PRD-HMI-5101','7寸工业触摸屏','HMI-5101-7IN','人机界面','台',1360.00,820.00,180,'active','常规触控屏型号','U0005'),
('PRD0010','000001','PRD-HMI-5201','10寸工业触摸屏','HMI-5201-10IN','人机界面','台',2180.00,1320.00,120,'active','支持高清显示与远程维护','U0005'),
('PRD0011','000001','PRD-BOX-6101','边缘计算盒','BOX-6101-J1900','边缘计算设备','台',2680.00,1620.00,100,'active','适用于产线边缘采集与分析','U0006'),
('PRD0012','000001','PRD-BOX-6201','高性能边缘计算盒','BOX-6201-I5','边缘计算设备','台',4680.00,2860.00,80,'active','支持视觉检测与AI推理','U0006'),
('PRD0013','000001','PRD-CAB-7101','标准控制柜','CAB-7101-800MM','控制柜','套',3280.00,2100.00,60,'active','常规设备配套控制柜','U0007'),
('PRD0014','000001','PRD-CAB-7201','防尘控制柜','CAB-7201-IP54','控制柜','套',4360.00,2860.00,50,'active','适用于粉尘较多环境','U0007'),
('PRD0015','000001','PRD-MOD-8101','IO扩展模块','MOD-8101-16DO','扩展模块','个',318.00,176.00,500,'active','用于PLC扩展输出点位','U0008'),
('PRD0016','000001','PRD-MOD-8201','模拟量采集模块','MOD-8201-8AI','扩展模块','个',580.00,335.00,360,'active','支持电流电压模拟量采集','U0008'),
('PRD0017','000001','PRD-CAM-9101','工业视觉相机','CAM-9101-2MP','视觉检测','台',2980.00,1860.00,90,'active','适用于二维码识别与缺陷检测','U0009'),
('PRD0018','000001','PRD-CAM-9201','高速工业视觉相机','CAM-9201-5MP','视觉检测','台',5260.00,3280.00,60,'active','适用于高速产线检测','U0009'),
('PRD0019','000001','PRD-NEW-9901','智能能耗采集终端','NEW-9901-TRIAL','能耗终端','台',1580.00,980.00,100,'trial','新产品试产阶段','U0010'),
('PRD0020','000001','PRD-NEW-9902','无线状态监测终端','NEW-9902-TRIAL','状态监测终端','台',1260.00,780.00,120,'trial','无线版本小批量验证中','U0010');


-- =====================================================
-- 3. 订单管理
-- =====================================================

CREATE TABLE biz_order (
  order_id varchar(32) NOT NULL COMMENT '订单ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  order_no varchar(64) NOT NULL COMMENT '订单编号',
  customer_name varchar(120) NOT NULL COMMENT '客户名称',
  customer_contact varchar(50) DEFAULT NULL COMMENT '客户联系人',
  customer_phone varchar(30) DEFAULT NULL COMMENT '联系电话',

  order_source varchar(50) DEFAULT NULL COMMENT '订单来源',
  order_date date NOT NULL COMMENT '下单日期',
  delivery_date date DEFAULT NULL COMMENT '预计交付日期',

  product_code varchar(64) DEFAULT NULL COMMENT '产品编码',
  product_name varchar(120) DEFAULT NULL COMMENT '产品名称',
  order_quantity int DEFAULT 0 COMMENT '订购数量',
  unit_price decimal(12,2) DEFAULT 0 COMMENT '单价',
  total_amount decimal(14,2) DEFAULT 0 COMMENT '订单金额',

  order_status varchar(30) DEFAULT 'pending' COMMENT '状态：pending待确认 production生产中 delivered已交付 cancelled已取消',
  payment_status varchar(30) DEFAULT 'unpaid' COMMENT '付款状态：unpaid未付款 partial部分付款 paid已付款',

  sales_owner varchar(50) DEFAULT NULL COMMENT '销售负责人',
  remark varchar(255) DEFAULT NULL,

  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (order_id),
  UNIQUE KEY uk_order_tenant_no (tenant_id, order_no),
  KEY idx_order_tenant_status (tenant_id, order_status),
  KEY idx_order_customer (tenant_id, customer_name),
  KEY idx_order_product (tenant_id, product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单管理表';


INSERT INTO biz_order
(order_id, tenant_id, order_no, customer_name, customer_contact, customer_phone, order_source, order_date, delivery_date, product_code, product_name, order_quantity, unit_price, total_amount, order_status, payment_status, sales_owner, remark, created_by)
VALUES
('ORD0001','000001','SO20260501001','苏州恒远智能装备有限公司','钱经理','138****5621','老客户复购','2026-05-01','2026-05-18','PRD-GW-1001','工业物联网网关',120,1280.00,153600.00,'production','partial','林晓峰','客户要求分两批发货','U0001'),
('ORD0002','000001','SO20260503002','杭州科立自动化科技有限公司','沈工','139****7712','官网询盘','2026-05-03','2026-05-22','PRD-PLC-2200','高性能PLC控制器',80,1460.00,116800.00,'production','unpaid','陈嘉伟','需配合客户现场调试时间','U0001'),
('ORD0003','000001','SO20260505003','宁波东海精密制造有限公司','周总','137****9045','渠道转介绍','2026-05-05','2026-05-25','PRD-HMI-5101','7寸工业触摸屏',60,1360.00,81600.00,'pending','unpaid','王诗雨','合同流程审批中','U0002'),
('ORD0004','000001','SO20260506004','上海联川机电工程有限公司','赵经理','136****3348','展会线索','2026-05-06','2026-05-27','PRD-PWR-4101','24V工业电源模块',300,236.00,70800.00,'production','paid','林晓峰','已收全款，优先排产','U0002'),
('ORD0005','000001','SO20260508005','嘉兴锐拓包装机械有限公司','马工','135****8810','老客户复购','2026-05-08','2026-05-30','PRD-SEN-3101','温湿度采集传感器',500,168.00,84000.00,'production','partial','陈嘉伟','用于客户新建车间环境监测','U0003'),
('ORD0006','000001','SO20260510006','无锡新能电气股份有限公司','刘经理','138****0198','招投标项目','2026-05-10','2026-06-05','PRD-CAB-7101','标准控制柜',28,3280.00,91840.00,'pending','unpaid','王诗雨','等待技术协议确认','U0003'),
('ORD0007','000001','SO20260512007','南京智控系统集成有限公司','严工','139****6420','渠道订单','2026-05-12','2026-06-01','PRD-MOD-8201','模拟量采集模块',160,580.00,92800.00,'production','partial','林晓峰','需随货提供测试报告','U0004'),
('ORD0008','000001','SO20260514008','常州华科机器人有限公司','高经理','137****1156','战略客户','2026-05-14','2026-06-08','PRD-BOX-6201','高性能边缘计算盒',35,4680.00,163800.00,'production','partial','陈嘉伟','客户用于视觉检测工位','U0004'),
('ORD0009','000001','SO20260516009','合肥云工工业互联网有限公司','宋经理','136****2280','官网询盘','2026-05-16','2026-06-10','PRD-GW-1002','工业物联网网关 Pro',70,1980.00,138600.00,'pending','unpaid','王诗雨','需确认5G模块版本','U0005'),
('ORD0010','000001','SO20260518010','绍兴远景纺织机械有限公司','俞工','135****4309','售后增购','2026-05-18','2026-06-06','PRD-SEN-3201','振动监测传感器',240,420.00,100800.00,'production','paid','林晓峰','设备状态监测项目补货','U0005'),
('ORD0011','000001','SO20260520011','青岛瑞辰智能制造有限公司','郑经理','138****7642','代理商订单','2026-05-20','2026-06-15','PRD-HMI-5201','10寸工业触摸屏',42,2180.00,91560.00,'pending','unpaid','陈嘉伟','代理商要求统一包装','U0006'),
('ORD0012','000001','SO20260522012','天津博远自动化设备有限公司','韩工','139****5567','老客户复购','2026-05-22','2026-06-18','PRD-PLC-2100','小型PLC控制器',120,860.00,103200.00,'production','partial','王诗雨','客户要求固件版本锁定','U0006'),
('ORD0013','000001','SO20260524013','重庆川仪智能装备有限公司','何经理','137****6921','项目订单','2026-05-24','2026-06-22','PRD-CAB-7201','防尘控制柜',18,4360.00,78480.00,'pending','unpaid','林晓峰','需确认柜体开孔图','U0007'),
('ORD0014','000001','SO20260526014','武汉盛达工业技术有限公司','郭经理','136****9002','展会线索','2026-05-26','2026-06-20','PRD-CAM-9101','工业视觉相机',26,2980.00,77480.00,'production','partial','陈嘉伟','与边缘计算盒配套交付','U0007'),
('ORD0015','000001','SO20260528015','郑州中原装备制造有限公司','杜工','135****2189','渠道订单','2026-05-28','2026-06-25','PRD-PWR-4201','48V工业电源模块',180,398.00,71640.00,'production','paid','王诗雨','项目现场急需备货','U0008'),
('ORD0016','000001','SO20260530016','东莞宏泰电子科技有限公司','梁经理','138****3457','老客户复购','2026-05-30','2026-06-28','PRD-MOD-8101','IO扩展模块',260,318.00,82680.00,'production','partial','林晓峰','分批交付，首批100个','U0008'),
('ORD0017','000001','SO20260601017','深圳云控科技有限公司','罗总','139****1023','战略客户','2026-06-01','2026-07-01','PRD-BOX-6101','边缘计算盒',55,2680.00,147400.00,'pending','unpaid','陈嘉伟','需要定制镜像系统','U0009'),
('ORD0018','000001','SO20260603018','厦门海沧机电有限公司','黄工','137****7830','官网询盘','2026-06-03','2026-06-30','PRD-CAM-9201','高速工业视觉相机',16,5260.00,84160.00,'pending','unpaid','王诗雨','客户等待样机测试结果','U0009'),
('ORD0019','000001','SO20260605019','佛山精联陶瓷设备有限公司','潘经理','136****4590','售后增购','2026-06-05','2026-07-03','PRD-NEW-9901','智能能耗采集终端',100,1580.00,158000.00,'production','partial','林晓峰','新产品试点订单','U0010'),
('ORD0020','000001','SO20260607020','成都川西自动化工程有限公司','谢工','135****6788','招投标项目','2026-06-07','2026-07-08','PRD-NEW-9902','无线状态监测终端',90,1260.00,113400.00,'pending','unpaid','陈嘉伟','等待客户技术评审','U0010');


-- =====================================================
-- 4. 财务管理
-- =====================================================

CREATE TABLE biz_finance_record (
  finance_id varchar(32) NOT NULL COMMENT '财务记录ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  record_no varchar(64) NOT NULL COMMENT '财务单号',
  record_type varchar(30) NOT NULL COMMENT '类型：income收入 expense支出',
  business_type varchar(50) DEFAULT NULL COMMENT '业务类型',
  related_no varchar(64) DEFAULT NULL COMMENT '关联单号',

  counterparty varchar(120) DEFAULT NULL COMMENT '往来单位',
  amount decimal(14,2) NOT NULL COMMENT '金额',
  tax_amount decimal(14,2) DEFAULT 0 COMMENT '税额',
  record_date date NOT NULL COMMENT '记账日期',

  payment_method varchar(50) DEFAULT NULL COMMENT '收付款方式',
  audit_status varchar(30) DEFAULT 'pending' COMMENT '审核状态',
  handler varchar(50) DEFAULT NULL COMMENT '经办人',

  remark varchar(255) DEFAULT NULL,
  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (finance_id),
  UNIQUE KEY uk_finance_tenant_no (tenant_id, record_no),
  KEY idx_finance_tenant_type (tenant_id, record_type),
  KEY idx_finance_tenant_date (tenant_id, record_date),
  KEY idx_finance_counterparty (tenant_id, counterparty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='财务管理表';


INSERT INTO biz_finance_record
(finance_id, tenant_id, record_no, record_type, business_type, related_no, counterparty, amount, tax_amount, record_date, payment_method, audit_status, handler, remark, created_by)
VALUES
('FIN0001','000001','FIN20260501001','income','销售收款','SO20260501001','苏州恒远智能装备有限公司',76800.00,8846.02,'2026-05-02','银行转账','approved','宋佳','订单首付款50%','U0001'),
('FIN0002','000001','FIN20260503002','expense','原材料采购','PO20260503001','深圳华芯电子有限公司',42600.00,4902.65,'2026-05-03','银行转账','approved','许静','采购MCU与通讯芯片','U0002'),
('FIN0003','000001','FIN20260505003','expense','外协加工','OUT20260505001','昆山精密机械加工厂',18500.00,2128.32,'2026-05-05','银行转账','approved','宋佳','铝合金外壳CNC加工费','U0002'),
('FIN0004','000001','FIN20260506004','income','销售收款','SO20260506004','上海联川机电工程有限公司',70800.00,8145.13,'2026-05-06','银行转账','approved','许静','订单全款到账','U0003'),
('FIN0005','000001','FIN20260508005','expense','设备维护','MT20260508001','苏州博瑞设备服务有限公司',9600.00,1104.42,'2026-05-08','银行转账','approved','宋佳','SMT贴片机年度保养','U0003'),
('FIN0006','000001','FIN20260510006','expense','辅料采购','PO20260510002','无锡佳成包装材料有限公司',7800.00,897.35,'2026-05-10','银行转账','approved','许静','出口纸箱与防静电袋采购','U0004'),
('FIN0007','000001','FIN20260512007','income','销售收款','SO20260512007','南京智控系统集成有限公司',46400.00,5338.05,'2026-05-12','银行转账','approved','宋佳','订单预付款50%','U0004'),
('FIN0008','000001','FIN20260514008','income','销售收款','SO20260514008','常州华科机器人有限公司',81900.00,9426.55,'2026-05-14','银行承兑','approved','许静','边缘计算盒项目款','U0005'),
('FIN0009','000001','FIN20260516009','expense','物流费用','LG20260516001','顺丰供应链管理有限公司',5300.00,610.62,'2026-05-16','银行转账','approved','宋佳','华东区域成品发运费用','U0005'),
('FIN0010','000001','FIN20260518010','income','销售收款','SO20260518010','绍兴远景纺织机械有限公司',100800.00,11603.54,'2026-05-18','银行转账','approved','许静','订单全款到账','U0006'),
('FIN0011','000001','FIN20260520011','expense','工资发放','PAY20260520001','生产一部员工薪资',186000.00,0.00,'2026-05-20','银行代发','approved','宋佳','5月生产部门工资','U0006'),
('FIN0012','000001','FIN20260522012','expense','厂房租金','RENT20260522001','苏州工业园区资产管理有限公司',52000.00,0.00,'2026-05-22','银行转账','approved','许静','5月厂房租金','U0007'),
('FIN0013','000001','FIN20260524013','expense','水电能源','ENE20260524001','国网苏州供电公司',36800.00,4233.63,'2026-05-24','银行转账','approved','宋佳','5月车间电费','U0007'),
('FIN0014','000001','FIN20260526014','income','销售收款','SO20260526014','武汉盛达工业技术有限公司',38740.00,4459.47,'2026-05-26','银行转账','approved','许静','视觉相机项目预付款','U0008'),
('FIN0015','000001','FIN20260528015','income','销售收款','SO20260528015','郑州中原装备制造有限公司',71640.00,8243.72,'2026-05-28','银行转账','approved','宋佳','订单全款到账','U0008'),
('FIN0016','000001','FIN20260530016','expense','研发支出','RD20260530001','上海智芯软件技术有限公司',28000.00,3221.24,'2026-05-30','银行转账','pending','许静','边缘计算固件开发服务费','U0009'),
('FIN0017','000001','FIN20260601017','income','销售收款','SO20260601017','深圳云控科技有限公司',44220.00,5089.03,'2026-06-01','银行转账','approved','宋佳','战略客户预付款30%','U0009'),
('FIN0018','000001','FIN20260603018','expense','检测认证','QC20260603001','上海赛宝检测技术有限公司',15200.00,1749.56,'2026-06-03','银行转账','approved','许静','工业相机EMC测试费用','U0010'),
('FIN0019','000001','FIN20260605019','income','销售收款','SO20260605019','佛山精联陶瓷设备有限公司',79000.00,9097.35,'2026-06-05','银行转账','approved','宋佳','新产品试点订单首款','U0010'),
('FIN0020','000001','FIN20260607020','expense','办公费用','OFF20260607001','京东企业购',8600.00,990.27,'2026-06-07','企业网银','approved','许静','办公电脑与耗材采购','U0010');


-- =====================================================
-- 5. 销售管理
-- =====================================================

CREATE TABLE biz_sales_record (
  sales_id varchar(32) NOT NULL COMMENT '销售记录ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  sales_no varchar(64) NOT NULL COMMENT '销售单号',
  order_no varchar(64) DEFAULT NULL COMMENT '关联订单号',
  customer_name varchar(120) NOT NULL COMMENT '客户名称',

  product_code varchar(64) NOT NULL COMMENT '产品编码',
  product_name varchar(120) NOT NULL COMMENT '产品名称',
  sales_quantity int NOT NULL COMMENT '销售数量',
  unit_price decimal(12,2) NOT NULL COMMENT '销售单价',
  sales_amount decimal(14,2) NOT NULL COMMENT '销售金额',

  sales_date date NOT NULL COMMENT '销售日期',
  sales_region varchar(50) DEFAULT NULL COMMENT '销售区域',
  sales_channel varchar(50) DEFAULT NULL COMMENT '销售渠道',
  sales_owner varchar(50) DEFAULT NULL COMMENT '销售负责人',

  delivery_status varchar(30) DEFAULT 'pending' COMMENT '发货状态',
  invoice_status varchar(30) DEFAULT 'not_invoiced' COMMENT '开票状态',

  remark varchar(255) DEFAULT NULL,
  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (sales_id),
  UNIQUE KEY uk_sales_tenant_no (tenant_id, sales_no),
  KEY idx_sales_tenant_date (tenant_id, sales_date),
  KEY idx_sales_customer (tenant_id, customer_name),
  KEY idx_sales_product (tenant_id, product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售管理表';


INSERT INTO biz_sales_record
(sales_id, tenant_id, sales_no, order_no, customer_name, product_code, product_name, sales_quantity, unit_price, sales_amount, sales_date, sales_region, sales_channel, sales_owner, delivery_status, invoice_status, remark, created_by)
VALUES
('SAL0001','000001','SAL20260502001','SO20260501001','苏州恒远智能装备有限公司','PRD-GW-1001','工业物联网网关',60,1280.00,76800.00,'2026-05-02','华东','老客户复购','林晓峰','partial','partial','首批60台已发货','U0001'),
('SAL0002','000001','SAL20260506002','SO20260506004','上海联川机电工程有限公司','PRD-PWR-4101','24V工业电源模块',300,236.00,70800.00,'2026-05-06','华东','展会线索','林晓峰','shipped','invoiced','已完成发货与开票','U0001'),
('SAL0003','000001','SAL20260508003','SO20260508005','嘉兴锐拓包装机械有限公司','PRD-SEN-3101','温湿度采集传感器',250,168.00,42000.00,'2026-05-08','华东','老客户复购','陈嘉伟','partial','not_invoiced','首批传感器已出库','U0002'),
('SAL0004','000001','SAL20260512004','SO20260512007','南京智控系统集成有限公司','PRD-MOD-8201','模拟量采集模块',80,580.00,46400.00,'2026-05-12','华东','渠道订单','王诗雨','partial','partial','随货提供检测报告','U0002'),
('SAL0005','000001','SAL20260514005','SO20260514008','常州华科机器人有限公司','PRD-BOX-6201','高性能边缘计算盒',18,4680.00,84240.00,'2026-05-14','华东','战略客户','陈嘉伟','partial','partial','客户分两批安装','U0003'),
('SAL0006','000001','SAL20260518006','SO20260518010','绍兴远景纺织机械有限公司','PRD-SEN-3201','振动监测传感器',240,420.00,100800.00,'2026-05-18','华东','售后增购','林晓峰','shipped','invoiced','全量交付完成','U0003'),
('SAL0007','000001','SAL20260522007','SO20260522012','天津博远自动化设备有限公司','PRD-PLC-2100','小型PLC控制器',60,860.00,51600.00,'2026-05-22','华北','老客户复购','王诗雨','partial','not_invoiced','首批60台发货','U0004'),
('SAL0008','000001','SAL20260526008','SO20260526014','武汉盛达工业技术有限公司','PRD-CAM-9101','工业视觉相机',13,2980.00,38740.00,'2026-05-26','华中','展会线索','陈嘉伟','pending','not_invoiced','等待配套镜头到货','U0004'),
('SAL0009','000001','SAL20260528009','SO20260528015','郑州中原装备制造有限公司','PRD-PWR-4201','48V工业电源模块',180,398.00,71640.00,'2026-05-28','华中','渠道订单','王诗雨','shipped','invoiced','项目急单已优先发货','U0005'),
('SAL0010','000001','SAL20260530010','SO20260530016','东莞宏泰电子科技有限公司','PRD-MOD-8101','IO扩展模块',100,318.00,31800.00,'2026-05-30','华南','老客户复购','林晓峰','partial','not_invoiced','首批100个已发货','U0005'),
('SAL0011','000001','SAL20260601011','SO20260601017','深圳云控科技有限公司','PRD-BOX-6101','边缘计算盒',16,2680.00,42880.00,'2026-06-01','华南','战略客户','陈嘉伟','pending','not_invoiced','等待客户确认系统镜像','U0006'),
('SAL0012','000001','SAL20260605012','SO20260605019','佛山精联陶瓷设备有限公司','PRD-NEW-9901','智能能耗采集终端',50,1580.00,79000.00,'2026-06-05','华南','售后增购','林晓峰','partial','partial','试点订单首批交付','U0006'),
('SAL0013','000001','SAL20260606013',NULL,'苏州明诚自动化有限公司','PRD-HMI-5101','7寸工业触摸屏',20,1360.00,27200.00,'2026-06-06','华东','现货销售','王诗雨','shipped','not_invoiced','客户临时补货','U0007'),
('SAL0014','000001','SAL20260607014',NULL,'上海聚能设备工程有限公司','PRD-PWR-4101','24V工业电源模块',120,236.00,28320.00,'2026-06-07','华东','现货销售','林晓峰','shipped','invoiced','常规备件销售','U0007'),
('SAL0015','000001','SAL20260608015',NULL,'南京恒科智能装备有限公司','PRD-GW-1001','工业物联网网关',25,1280.00,32000.00,'2026-06-08','华东','代理商订单','陈嘉伟','pending','not_invoiced','等待仓库拣货','U0008'),
('SAL0016','000001','SAL20260609016',NULL,'杭州森川环保设备有限公司','PRD-SEN-3101','温湿度采集传感器',180,168.00,30240.00,'2026-06-09','华东','官网询盘','王诗雨','shipped','not_invoiced','用于环保设备温湿度监控','U0008'),
('SAL0017','000001','SAL20260610017',NULL,'青岛奥普智能科技有限公司','PRD-PLC-2200','高性能PLC控制器',18,1460.00,26280.00,'2026-06-10','华北','渠道订单','林晓峰','pending','not_invoiced','客户要求下周统一发货','U0009'),
('SAL0018','000001','SAL20260611018',NULL,'重庆新航工业技术有限公司','PRD-CAB-7101','标准控制柜',6,3280.00,19680.00,'2026-06-11','西南','项目订单','陈嘉伟','pending','not_invoiced','柜体包装需加固','U0009'),
('SAL0019','000001','SAL20260612019',NULL,'成都华创自动化有限公司','PRD-MOD-8201','模拟量采集模块',45,580.00,26100.00,'2026-06-12','西南','老客户复购','王诗雨','shipped','partial','客户账期开票','U0010'),
('SAL0020','000001','SAL20260613020',NULL,'厦门精研电子有限公司','PRD-CAM-9201','高速工业视觉相机',5,5260.00,26300.00,'2026-06-13','华南','官网询盘','林晓峰','pending','not_invoiced','等待技术确认镜头接口','U0010');


-- =====================================================
-- 6. 库存管理
-- =====================================================

CREATE TABLE biz_inventory (
  inventory_id varchar(32) NOT NULL COMMENT '库存ID',
  tenant_id varchar(32) NOT NULL COMMENT '租户ID',

  warehouse_code varchar(64) NOT NULL COMMENT '仓库编码',
  warehouse_name varchar(100) NOT NULL COMMENT '仓库名称',
  location_code varchar(64) DEFAULT NULL COMMENT '库位编码',

  product_code varchar(64) NOT NULL COMMENT '产品编码',
  product_name varchar(120) NOT NULL COMMENT '产品名称',
  batch_no varchar(64) DEFAULT NULL COMMENT '批次号',

  available_qty int DEFAULT 0 COMMENT '可用库存',
  locked_qty int DEFAULT 0 COMMENT '锁定库存',
  in_transit_qty int DEFAULT 0 COMMENT '在途库存',
  safety_stock int DEFAULT 0 COMMENT '安全库存',

  inventory_status varchar(30) DEFAULT 'normal' COMMENT '库存状态：normal正常 low_stock低库存 overstock积压',
  last_inbound_date date DEFAULT NULL COMMENT '最近入库日期',
  last_outbound_date date DEFAULT NULL COMMENT '最近出库日期',

  remark varchar(255) DEFAULT NULL,
  created_by varchar(32) DEFAULT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted tinyint DEFAULT 0,

  PRIMARY KEY (inventory_id),
  KEY idx_inventory_tenant_product (tenant_id, product_code),
  KEY idx_inventory_warehouse (tenant_id, warehouse_code),
  KEY idx_inventory_status (tenant_id, inventory_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存管理表';


INSERT INTO biz_inventory
(inventory_id, tenant_id, warehouse_code, warehouse_name, location_code, product_code, product_name, batch_no, available_qty, locked_qty, in_transit_qty, safety_stock, inventory_status, last_inbound_date, last_outbound_date, remark, created_by)
VALUES
('INV0001','000001','WH-FG-01','成品仓一库','A01-01','PRD-GW-1001','工业物联网网关','B20260501',420,80,120,300,'normal','2026-06-01','2026-06-08','常规库存充足','U0001'),
('INV0002','000001','WH-FG-01','成品仓一库','A01-02','PRD-GW-1002','工业物联网网关 Pro','B20260503',168,70,60,200,'low_stock','2026-06-02','2026-06-07','5G版本库存偏紧','U0001'),
('INV0003','000001','WH-FG-01','成品仓一库','A02-01','PRD-PLC-2100','小型PLC控制器','B20260505',286,60,100,250,'normal','2026-06-03','2026-06-09','计划补货中','U0002'),
('INV0004','000001','WH-FG-01','成品仓一库','A02-02','PRD-PLC-2200','高性能PLC控制器','B20260507',132,48,80,180,'low_stock','2026-06-04','2026-06-10','订单占用较多','U0002'),
('INV0005','000001','WH-FG-02','成品仓二库','B01-01','PRD-SEN-3101','温湿度采集传感器','B20260509',1180,220,300,800,'normal','2026-06-05','2026-06-09','传感器批量库存稳定','U0003'),
('INV0006','000001','WH-FG-02','成品仓二库','B01-02','PRD-SEN-3201','振动监测传感器','B20260511',460,180,240,500,'low_stock','2026-06-06','2026-06-10','近期售后增购较多','U0003'),
('INV0007','000001','WH-FG-02','成品仓二库','B02-01','PRD-PWR-4101','24V工业电源模块','B20260513',820,160,200,600,'normal','2026-06-03','2026-06-07','标准电源库存充足','U0004'),
('INV0008','000001','WH-FG-02','成品仓二库','B02-02','PRD-PWR-4201','48V工业电源模块','B20260515',390,110,150,450,'low_stock','2026-06-05','2026-06-08','项目急单消耗较快','U0004'),
('INV0009','000001','WH-FG-03','成品仓三库','C01-01','PRD-HMI-5101','7寸工业触摸屏','B20260517',205,45,60,180,'normal','2026-06-02','2026-06-06','常规库存','U0005'),
('INV0010','000001','WH-FG-03','成品仓三库','C01-02','PRD-HMI-5201','10寸工业触摸屏','B20260519',96,36,50,120,'low_stock','2026-06-04','2026-06-09','大屏型号需补货','U0005'),
('INV0011','000001','WH-FG-03','成品仓三库','C02-01','PRD-BOX-6101','边缘计算盒','B20260521',88,42,60,100,'low_stock','2026-06-05','2026-06-10','战略客户订单占用','U0006'),
('INV0012','000001','WH-FG-03','成品仓三库','C02-02','PRD-BOX-6201','高性能边缘计算盒','B20260523',52,30,40,80,'low_stock','2026-06-06','2026-06-11','高性能版本库存紧张','U0006'),
('INV0013','000001','WH-CAB-01','控制柜仓','D01-01','PRD-CAB-7101','标准控制柜','B20260525',76,18,20,60,'normal','2026-06-01','2026-06-05','柜体库存正常','U0007'),
('INV0014','000001','WH-CAB-01','控制柜仓','D01-02','PRD-CAB-7201','防尘控制柜','B20260527',42,15,18,50,'low_stock','2026-06-03','2026-06-07','防尘柜订单待排产','U0007'),
('INV0015','000001','WH-FG-04','成品仓四库','E01-01','PRD-MOD-8101','IO扩展模块','B20260529',620,180,220,500,'normal','2026-06-05','2026-06-12','常用扩展模块库存正常','U0008'),
('INV0016','000001','WH-FG-04','成品仓四库','E01-02','PRD-MOD-8201','模拟量采集模块','B20260601',330,120,160,360,'low_stock','2026-06-06','2026-06-12','模拟量模块需追加生产','U0008'),
('INV0017','000001','WH-VIS-01','视觉产品仓','F01-01','PRD-CAM-9101','工业视觉相机','B20260603',84,26,30,90,'low_stock','2026-06-07','2026-06-12','配套订单增加','U0009'),
('INV0018','000001','WH-VIS-01','视觉产品仓','F01-02','PRD-CAM-9201','高速工业视觉相机','B20260605',48,18,25,60,'low_stock','2026-06-08','2026-06-13','高速相机安全库存不足','U0009'),
('INV0019','000001','WH-TRIAL-01','试产成品仓','T01-01','PRD-NEW-9901','智能能耗采集终端','B20260607',160,50,80,100,'normal','2026-06-09','2026-06-13','试点订单备货中','U0010'),
('INV0020','000001','WH-TRIAL-01','试产成品仓','T01-02','PRD-NEW-9902','无线状态监测终端','B20260609',110,40,70,120,'low_stock','2026-06-10','2026-06-13','试产批次库存偏低','U0010');
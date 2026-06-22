-- MySQL dump 10.13  Distrib 8.0.27, for Linux (x86_64)
--
-- Host: localhost    Database: bls
-- ------------------------------------------------------
-- Server version	8.0.27

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `biz_finance_record`
--

DROP TABLE IF EXISTS `biz_finance_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_finance_record` (
  `finance_id` varchar(32) NOT NULL COMMENT '财务记录ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `record_no` varchar(64) NOT NULL COMMENT '财务单号',
  `record_type` varchar(30) NOT NULL COMMENT '类型：income收入 expense支出',
  `business_type` varchar(50) DEFAULT NULL COMMENT '业务类型',
  `related_no` varchar(64) DEFAULT NULL COMMENT '关联单号',
  `counterparty` varchar(120) DEFAULT NULL COMMENT '往来单位',
  `amount` decimal(14,2) NOT NULL COMMENT '金额',
  `tax_amount` decimal(14,2) DEFAULT '0.00' COMMENT '税额',
  `record_date` date NOT NULL COMMENT '记账日期',
  `payment_method` varchar(50) DEFAULT NULL COMMENT '收付款方式',
  `audit_status` varchar(30) DEFAULT 'pending' COMMENT '审核状态',
  `handler` varchar(50) DEFAULT NULL COMMENT '经办人',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`finance_id`),
  UNIQUE KEY `uk_finance_tenant_no` (`tenant_id`,`record_no`),
  KEY `idx_finance_tenant_type` (`tenant_id`,`record_type`),
  KEY `idx_finance_tenant_date` (`tenant_id`,`record_date`),
  KEY `idx_finance_counterparty` (`tenant_id`,`counterparty`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='财务管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_finance_record`
--

LOCK TABLES `biz_finance_record` WRITE;
/*!40000 ALTER TABLE `biz_finance_record` DISABLE KEYS */;
INSERT INTO `biz_finance_record` VALUES ('FIN0001','000000','FIN20260501001','income','销售收款','SO20260501001','苏州恒远智能装备有限公司',76800.00,8846.02,'2026-05-02','银行转账','approved','宋佳','订单首付款50%','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0002','000000','FIN20260503002','expense','原材料采购','PO20260503001','深圳华芯电子有限公司',42600.00,4902.65,'2026-05-03','银行转账','approved','许静','采购MCU与通讯芯片','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0003','000000','FIN20260505003','expense','外协加工','OUT20260505001','昆山精密机械加工厂',18500.00,2128.32,'2026-05-05','银行转账','approved','宋佳','铝合金外壳CNC加工费','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0004','000000','FIN20260506004','income','销售收款','SO20260506004','上海联川机电工程有限公司',70800.00,8145.13,'2026-05-06','银行转账','approved','许静','订单全款到账','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0005','000000','FIN20260508005','expense','设备维护','MT20260508001','苏州博瑞设备服务有限公司',9600.00,1104.42,'2026-05-08','银行转账','approved','宋佳','SMT贴片机年度保养','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0006','000000','FIN20260510006','expense','辅料采购','PO20260510002','无锡佳成包装材料有限公司',7800.00,897.35,'2026-05-10','银行转账','approved','许静','出口纸箱与防静电袋采购','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0007','000000','FIN20260512007','income','销售收款','SO20260512007','南京智控系统集成有限公司',46400.00,5338.05,'2026-05-12','银行转账','approved','宋佳','订单预付款50%','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0008','000000','FIN20260514008','income','销售收款','SO20260514008','常州华科机器人有限公司',81900.00,9426.55,'2026-05-14','银行承兑','approved','许静','边缘计算盒项目款','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0009','000000','FIN20260516009','expense','物流费用','LG20260516001','顺丰供应链管理有限公司',5300.00,610.62,'2026-05-16','银行转账','approved','宋佳','华东区域成品发运费用','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0010','000000','FIN20260518010','income','销售收款','SO20260518010','绍兴远景纺织机械有限公司',100800.00,11603.54,'2026-05-18','银行转账','approved','许静','订单全款到账','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0011','000000','FIN20260520011','expense','工资发放','PAY20260520001','生产一部员工薪资',186000.00,0.00,'2026-05-20','银行代发','approved','宋佳','5月生产部门工资','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0012','000000','FIN20260522012','expense','厂房租金','RENT20260522001','苏州工业园区资产管理有限公司',52000.00,0.00,'2026-05-22','银行转账','approved','许静','5月厂房租金','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0013','000000','FIN20260524013','expense','水电能源','ENE20260524001','国网苏州供电公司',36800.00,4233.63,'2026-05-24','银行转账','approved','宋佳','5月车间电费','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0014','000000','FIN20260526014','income','销售收款','SO20260526014','武汉盛达工业技术有限公司',38740.00,4459.47,'2026-05-26','银行转账','approved','许静','视觉相机项目预付款','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0015','000000','FIN20260528015','income','销售收款','SO20260528015','郑州中原装备制造有限公司',71640.00,8243.72,'2026-05-28','银行转账','approved','宋佳','订单全款到账','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0016','000000','FIN20260530016','expense','研发支出','RD20260530001','上海智芯软件技术有限公司',28000.00,3221.24,'2026-05-30','银行转账','pending','许静','边缘计算固件开发服务费','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0017','000000','FIN20260601017','income','销售收款','SO20260601017','深圳云控科技有限公司',44220.00,5089.03,'2026-06-01','银行转账','approved','宋佳','战略客户预付款30%','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0018','000000','FIN20260603018','expense','检测认证','QC20260603001','上海赛宝检测技术有限公司',15200.00,1749.56,'2026-06-03','银行转账','approved','许静','工业相机EMC测试费用','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0019','000000','FIN20260605019','income','销售收款','SO20260605019','佛山精联陶瓷设备有限公司',79000.00,9097.35,'2026-06-05','银行转账','approved','宋佳','新产品试点订单首款','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_finance_record` VALUES ('FIN0020','000000','FIN20260607020','expense','办公费用','OFF20260607001','京东企业购',8600.00,990.27,'2026-06-07','企业网银','approved','许静','办公电脑与耗材采购','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
/*!40000 ALTER TABLE `biz_finance_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_inventory`
--

DROP TABLE IF EXISTS `biz_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_inventory` (
  `inventory_id` varchar(32) NOT NULL COMMENT '库存ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `warehouse_code` varchar(64) NOT NULL COMMENT '仓库编码',
  `warehouse_name` varchar(100) NOT NULL COMMENT '仓库名称',
  `location_code` varchar(64) DEFAULT NULL COMMENT '库位编码',
  `product_code` varchar(64) NOT NULL COMMENT '产品编码',
  `product_name` varchar(120) NOT NULL COMMENT '产品名称',
  `batch_no` varchar(64) DEFAULT NULL COMMENT '批次号',
  `available_qty` int DEFAULT '0' COMMENT '可用库存',
  `locked_qty` int DEFAULT '0' COMMENT '锁定库存',
  `in_transit_qty` int DEFAULT '0' COMMENT '在途库存',
  `safety_stock` int DEFAULT '0' COMMENT '安全库存',
  `inventory_status` varchar(30) DEFAULT 'normal' COMMENT '库存状态：normal正常 low_stock低库存 overstock积压',
  `last_inbound_date` date DEFAULT NULL COMMENT '最近入库日期',
  `last_outbound_date` date DEFAULT NULL COMMENT '最近出库日期',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`inventory_id`),
  KEY `idx_inventory_tenant_product` (`tenant_id`,`product_code`),
  KEY `idx_inventory_warehouse` (`tenant_id`,`warehouse_code`),
  KEY `idx_inventory_status` (`tenant_id`,`inventory_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='库存管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_inventory`
--

LOCK TABLES `biz_inventory` WRITE;
/*!40000 ALTER TABLE `biz_inventory` DISABLE KEYS */;
INSERT INTO `biz_inventory` VALUES ('INV0001','000000','WH-FG-01','成品仓一库','A01-01','PRD-GW-1001','工业物联网网关','B20260501',420,80,120,300,'normal','2026-06-01','2026-06-08','常规库存充足','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0002','000000','WH-FG-01','成品仓一库','A01-02','PRD-GW-1002','工业物联网网关 Pro','B20260503',168,70,60,200,'low_stock','2026-06-02','2026-06-07','5G版本库存偏紧','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0003','000000','WH-FG-01','成品仓一库','A02-01','PRD-PLC-2100','小型PLC控制器','B20260505',286,60,100,250,'normal','2026-06-03','2026-06-09','计划补货中','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0004','000000','WH-FG-01','成品仓一库','A02-02','PRD-PLC-2200','高性能PLC控制器','B20260507',132,48,80,180,'low_stock','2026-06-04','2026-06-10','订单占用较多','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0005','000000','WH-FG-02','成品仓二库','B01-01','PRD-SEN-3101','温湿度采集传感器','B20260509',1180,220,300,800,'normal','2026-06-05','2026-06-09','传感器批量库存稳定','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0006','000000','WH-FG-02','成品仓二库','B01-02','PRD-SEN-3201','振动监测传感器','B20260511',460,180,240,500,'low_stock','2026-06-06','2026-06-10','近期售后增购较多','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0007','000000','WH-FG-02','成品仓二库','B02-01','PRD-PWR-4101','24V工业电源模块','B20260513',820,160,200,600,'normal','2026-06-03','2026-06-07','标准电源库存充足','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0008','000000','WH-FG-02','成品仓二库','B02-02','PRD-PWR-4201','48V工业电源模块','B20260515',390,110,150,450,'low_stock','2026-06-05','2026-06-08','项目急单消耗较快','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0009','000000','WH-FG-03','成品仓三库','C01-01','PRD-HMI-5101','7寸工业触摸屏','B20260517',205,45,60,180,'normal','2026-06-02','2026-06-06','常规库存','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0010','000000','WH-FG-03','成品仓三库','C01-02','PRD-HMI-5201','10寸工业触摸屏','B20260519',96,36,50,120,'low_stock','2026-06-04','2026-06-09','大屏型号需补货','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0011','000000','WH-FG-03','成品仓三库','C02-01','PRD-BOX-6101','边缘计算盒','B20260521',88,42,60,100,'low_stock','2026-06-05','2026-06-10','战略客户订单占用','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0012','000000','WH-FG-03','成品仓三库','C02-02','PRD-BOX-6201','高性能边缘计算盒','B20260523',52,30,40,80,'low_stock','2026-06-06','2026-06-11','高性能版本库存紧张','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0013','000000','WH-CAB-01','控制柜仓','D01-01','PRD-CAB-7101','标准控制柜','B20260525',76,18,20,60,'normal','2026-06-01','2026-06-05','柜体库存正常','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0014','000000','WH-CAB-01','控制柜仓','D01-02','PRD-CAB-7201','防尘控制柜','B20260527',42,15,18,50,'low_stock','2026-06-03','2026-06-07','防尘柜订单待排产','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0015','000000','WH-FG-04','成品仓四库','E01-01','PRD-MOD-8101','IO扩展模块','B20260529',620,180,220,500,'normal','2026-06-05','2026-06-12','常用扩展模块库存正常','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0016','000000','WH-FG-04','成品仓四库','E01-02','PRD-MOD-8201','模拟量采集模块','B20260601',330,120,160,360,'low_stock','2026-06-06','2026-06-12','模拟量模块需追加生产','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0017','000000','WH-VIS-01','视觉产品仓','F01-01','PRD-CAM-9101','工业视觉相机','B20260603',84,26,30,90,'low_stock','2026-06-07','2026-06-12','配套订单增加','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0018','000000','WH-VIS-01','视觉产品仓','F01-02','PRD-CAM-9201','高速工业视觉相机','B20260605',48,18,25,60,'low_stock','2026-06-08','2026-06-13','高速相机安全库存不足','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0019','000000','WH-TRIAL-01','试产成品仓','T01-01','PRD-NEW-9901','智能能耗采集终端','B20260607',160,50,80,100,'normal','2026-06-09','2026-06-13','试点订单备货中','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_inventory` VALUES ('INV0020','000000','WH-TRIAL-01','试产成品仓','T01-02','PRD-NEW-9902','无线状态监测终端','B20260609',110,40,70,120,'low_stock','2026-06-10','2026-06-13','试产批次库存偏低','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
/*!40000 ALTER TABLE `biz_inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_order`
--

DROP TABLE IF EXISTS `biz_order`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_order` (
  `order_id` varchar(32) NOT NULL COMMENT '订单ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `order_no` varchar(64) NOT NULL COMMENT '订单编号',
  `customer_name` varchar(120) NOT NULL COMMENT '客户名称',
  `customer_contact` varchar(50) DEFAULT NULL COMMENT '客户联系人',
  `customer_phone` varchar(30) DEFAULT NULL COMMENT '联系电话',
  `order_source` varchar(50) DEFAULT NULL COMMENT '订单来源',
  `order_date` date NOT NULL COMMENT '下单日期',
  `delivery_date` date DEFAULT NULL COMMENT '预计交付日期',
  `product_code` varchar(64) DEFAULT NULL COMMENT '产品编码',
  `product_name` varchar(120) DEFAULT NULL COMMENT '产品名称',
  `order_quantity` int DEFAULT '0' COMMENT '订购数量',
  `unit_price` decimal(12,2) DEFAULT '0.00' COMMENT '单价',
  `total_amount` decimal(14,2) DEFAULT '0.00' COMMENT '订单金额',
  `order_status` varchar(30) DEFAULT 'pending' COMMENT '状态：pending待确认 production生产中 delivered已交付 cancelled已取消',
  `payment_status` varchar(30) DEFAULT 'unpaid' COMMENT '付款状态：unpaid未付款 partial部分付款 paid已付款',
  `sales_owner` varchar(50) DEFAULT NULL COMMENT '销售负责人',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uk_order_tenant_no` (`tenant_id`,`order_no`),
  KEY `idx_order_tenant_status` (`tenant_id`,`order_status`),
  KEY `idx_order_customer` (`tenant_id`,`customer_name`),
  KEY `idx_order_product` (`tenant_id`,`product_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='订单管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_order`
--

LOCK TABLES `biz_order` WRITE;
/*!40000 ALTER TABLE `biz_order` DISABLE KEYS */;
INSERT INTO `biz_order` VALUES ('ORD0001','000000','SO20260501001','苏州恒远智能装备有限公司','钱经理','138****5621','老客户复购','2026-05-01','2026-05-18','PRD-GW-1001','工业物联网网关',120,1280.00,153600.00,'production','partial','林晓峰','客户要求分两批发货','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0002','000000','SO20260503002','杭州科立自动化科技有限公司','沈工','139****7712','官网询盘','2026-05-03','2026-05-22','PRD-PLC-2200','高性能PLC控制器',80,1460.00,116800.00,'production','unpaid','陈嘉伟','需配合客户现场调试时间','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0003','000000','SO20260505003','宁波东海精密制造有限公司','周总','137****9045','渠道转介绍','2026-05-05','2026-05-25','PRD-HMI-5101','7寸工业触摸屏',60,1360.00,81600.00,'pending','unpaid','王诗雨','合同流程审批中','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0004','000000','SO20260506004','上海联川机电工程有限公司','赵经理','136****3348','展会线索','2026-05-06','2026-05-27','PRD-PWR-4101','24V工业电源模块',300,236.00,70800.00,'production','paid','林晓峰','已收全款，优先排产','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0005','000000','SO20260508005','嘉兴锐拓包装机械有限公司','马工','135****8810','老客户复购','2026-05-08','2026-05-30','PRD-SEN-3101','温湿度采集传感器',500,168.00,84000.00,'production','partial','陈嘉伟','用于客户新建车间环境监测','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0006','000000','SO20260510006','无锡新能电气股份有限公司','刘经理','138****0198','招投标项目','2026-05-10','2026-06-05','PRD-CAB-7101','标准控制柜',28,3280.00,91840.00,'pending','unpaid','王诗雨','等待技术协议确认','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0007','000000','SO20260512007','南京智控系统集成有限公司','严工','139****6420','渠道订单','2026-05-12','2026-06-01','PRD-MOD-8201','模拟量采集模块',160,580.00,92800.00,'production','partial','林晓峰','需随货提供测试报告','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0008','000000','SO20260514008','常州华科机器人有限公司','高经理','137****1156','战略客户','2026-05-14','2026-06-08','PRD-BOX-6201','高性能边缘计算盒',35,4680.00,163800.00,'production','partial','陈嘉伟','客户用于视觉检测工位','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0009','000000','SO20260516009','合肥云工工业互联网有限公司','宋经理','136****2280','官网询盘','2026-05-16','2026-06-10','PRD-GW-1002','工业物联网网关 Pro',70,1980.00,138600.00,'pending','unpaid','王诗雨','需确认5G模块版本','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0010','000000','SO20260518010','绍兴远景纺织机械有限公司','俞工','135****4309','售后增购','2026-05-18','2026-06-06','PRD-SEN-3201','振动监测传感器',240,420.00,100800.00,'production','paid','林晓峰','设备状态监测项目补货','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0011','000000','SO20260520011','青岛瑞辰智能制造有限公司','郑经理','138****7642','代理商订单','2026-05-20','2026-06-15','PRD-HMI-5201','10寸工业触摸屏',42,2180.00,91560.00,'pending','unpaid','陈嘉伟','代理商要求统一包装','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0012','000000','SO20260522012','天津博远自动化设备有限公司','韩工','139****5567','老客户复购','2026-05-22','2026-06-18','PRD-PLC-2100','小型PLC控制器',120,860.00,103200.00,'production','partial','王诗雨','客户要求固件版本锁定','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0013','000000','SO20260524013','重庆川仪智能装备有限公司','何经理','137****6921','项目订单','2026-05-24','2026-06-22','PRD-CAB-7201','防尘控制柜',18,4360.00,78480.00,'pending','unpaid','林晓峰','需确认柜体开孔图','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0014','000000','SO20260526014','武汉盛达工业技术有限公司','郭经理','136****9002','展会线索','2026-05-26','2026-06-20','PRD-CAM-9101','工业视觉相机',26,2980.00,77480.00,'production','partial','陈嘉伟','与边缘计算盒配套交付','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0015','000000','SO20260528015','郑州中原装备制造有限公司','杜工','135****2189','渠道订单','2026-05-28','2026-06-25','PRD-PWR-4201','48V工业电源模块',180,398.00,71640.00,'production','paid','王诗雨','项目现场急需备货','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0016','000000','SO20260530016','东莞宏泰电子科技有限公司','梁经理','138****3457','老客户复购','2026-05-30','2026-06-28','PRD-MOD-8101','IO扩展模块',260,318.00,82680.00,'production','partial','林晓峰','分批交付，首批100个','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0017','000000','SO20260601017','深圳云控科技有限公司','罗总','139****1023','战略客户','2026-06-01','2026-07-01','PRD-BOX-6101','边缘计算盒',55,2680.00,147400.00,'pending','unpaid','陈嘉伟','需要定制镜像系统','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0018','000000','SO20260603018','厦门海沧机电有限公司','黄工','137****7830','官网询盘','2026-06-03','2026-06-30','PRD-CAM-9201','高速工业视觉相机',16,5260.00,84160.00,'pending','unpaid','王诗雨','客户等待样机测试结果','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0019','000000','SO20260605019','佛山精联陶瓷设备有限公司','潘经理','136****4590','售后增购','2026-06-05','2026-07-03','PRD-NEW-9901','智能能耗采集终端',100,1580.00,158000.00,'production','partial','林晓峰','新产品试点订单','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_order` VALUES ('ORD0020','000000','SO20260607020','成都川西自动化工程有限公司','谢工','135****6788','招投标项目','2026-06-07','2026-07-08','PRD-NEW-9902','无线状态监测终端',90,1260.00,113400.00,'pending','unpaid','陈嘉伟','等待客户技术评审','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
/*!40000 ALTER TABLE `biz_order` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_product`
--

DROP TABLE IF EXISTS `biz_product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_product` (
  `product_id` varchar(32) NOT NULL COMMENT '产品ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `product_code` varchar(64) NOT NULL COMMENT '产品编码',
  `product_name` varchar(120) NOT NULL COMMENT '产品名称',
  `product_model` varchar(100) DEFAULT NULL COMMENT '规格型号',
  `category_name` varchar(80) DEFAULT NULL COMMENT '产品分类',
  `unit` varchar(20) DEFAULT '台' COMMENT '单位',
  `standard_price` decimal(12,2) DEFAULT '0.00' COMMENT '标准售价',
  `cost_price` decimal(12,2) DEFAULT '0.00' COMMENT '成本价',
  `safety_stock` int DEFAULT '0' COMMENT '安全库存',
  `product_status` varchar(20) DEFAULT 'active' COMMENT '状态：active启用 inactive停用 trial试产',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `uk_product_tenant_code` (`tenant_id`,`product_code`),
  KEY `idx_product_tenant_category` (`tenant_id`,`category_name`),
  KEY `idx_product_tenant_status` (`tenant_id`,`product_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_product`
--

LOCK TABLES `biz_product` WRITE;
/*!40000 ALTER TABLE `biz_product` DISABLE KEYS */;
INSERT INTO `biz_product` VALUES ('PRD0001','000000','PRD-GW-1001','工业物联网网关','GW-1001-4G','工业网关','台',1280.00,760.00,300,'active','支持4G联网和Modbus协议','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0002','000000','PRD-GW-1002','工业物联网网关 Pro','GW-1002-5G','工业网关','台',1980.00,1160.00,200,'active','支持5G、以太网和边缘计算','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0003','000000','PRD-PLC-2100','小型PLC控制器','PLC-2100-16DI','控制器','台',860.00,510.00,250,'active','适用于中小型自动化设备','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0004','000000','PRD-PLC-2200','高性能PLC控制器','PLC-2200-32DI','控制器','台',1460.00,890.00,180,'active','支持高速脉冲与扩展IO','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0005','000000','PRD-SEN-3101','温湿度采集传感器','SEN-3101-RS485','传感器','只',168.00,82.00,800,'active','车间环境监测常用型号','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0006','000000','PRD-SEN-3201','振动监测传感器','SEN-3201-MEMS','传感器','只',420.00,238.00,500,'active','用于设备预测性维护','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0007','000000','PRD-PWR-4101','24V工业电源模块','PWR-4101-120W','电源模块','个',236.00,132.00,600,'active','标准导轨安装电源','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0008','000000','PRD-PWR-4201','48V工业电源模块','PWR-4201-240W','电源模块','个',398.00,225.00,450,'active','适用于大功率控制柜','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0009','000000','PRD-HMI-5101','7寸工业触摸屏','HMI-5101-7IN','人机界面','台',1360.00,820.00,180,'active','常规触控屏型号','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0010','000000','PRD-HMI-5201','10寸工业触摸屏','HMI-5201-10IN','人机界面','台',2180.00,1320.00,120,'active','支持高清显示与远程维护','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0011','000000','PRD-BOX-6101','边缘计算盒','BOX-6101-J1900','边缘计算设备','台',2680.00,1620.00,100,'active','适用于产线边缘采集与分析','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0012','000000','PRD-BOX-6201','高性能边缘计算盒','BOX-6201-I5','边缘计算设备','台',4680.00,2860.00,80,'active','支持视觉检测与AI推理','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0013','000000','PRD-CAB-7101','标准控制柜','CAB-7101-800MM','控制柜','套',3280.00,2100.00,60,'active','常规设备配套控制柜','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0014','000000','PRD-CAB-7201','防尘控制柜','CAB-7201-IP54','控制柜','套',4360.00,2860.00,50,'active','适用于粉尘较多环境','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0015','000000','PRD-MOD-8101','IO扩展模块','MOD-8101-16DO','扩展模块','个',318.00,176.00,500,'active','用于PLC扩展输出点位','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0016','000000','PRD-MOD-8201','模拟量采集模块','MOD-8201-8AI','扩展模块','个',580.00,335.00,360,'active','支持电流电压模拟量采集','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0017','000000','PRD-CAM-9101','工业视觉相机','CAM-9101-2MP','视觉检测','台',2980.00,1860.00,90,'active','适用于二维码识别与缺陷检测','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0018','000000','PRD-CAM-9201','高速工业视觉相机','CAM-9201-5MP','视觉检测','台',5260.00,3280.00,60,'active','适用于高速产线检测','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0019','000000','PRD-NEW-9901','智能能耗采集终端','NEW-9901-TRIAL','能耗终端','台',1580.00,980.00,100,'trial','新产品试产阶段','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_product` VALUES ('PRD0020','000000','PRD-NEW-9902','无线状态监测终端','NEW-9902-TRIAL','状态监测终端','台',1260.00,780.00,120,'trial','无线版本小批量验证中','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
/*!40000 ALTER TABLE `biz_product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_production_line`
--

DROP TABLE IF EXISTS `biz_production_line`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_production_line` (
  `line_id` varchar(32) NOT NULL COMMENT '流水线ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `line_code` varchar(64) NOT NULL COMMENT '流水线编码',
  `line_name` varchar(100) NOT NULL COMMENT '流水线名称',
  `workshop_name` varchar(100) NOT NULL COMMENT '所属车间',
  `line_type` varchar(50) DEFAULT NULL COMMENT '产线类型',
  `main_product` varchar(100) DEFAULT NULL COMMENT '主要生产产品',
  `line_manager` varchar(50) DEFAULT NULL COMMENT '产线负责人',
  `shift_type` varchar(50) DEFAULT NULL COMMENT '班次类型',
  `daily_capacity` int DEFAULT '0' COMMENT '设计日产能',
  `current_capacity` int DEFAULT '0' COMMENT '当前日产量',
  `equipment_count` int DEFAULT '0' COMMENT '设备数量',
  `worker_count` int DEFAULT '0' COMMENT '作业人数',
  `yield_rate` decimal(5,2) DEFAULT '0.00' COMMENT '良品率',
  `utilization_rate` decimal(5,2) DEFAULT '0.00' COMMENT '稼动率',
  `status` varchar(20) DEFAULT 'running' COMMENT '状态：running运行中 maintenance维护中 stopped停线 idle空闲',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`line_id`),
  UNIQUE KEY `uk_line_tenant_code` (`tenant_id`,`line_code`),
  KEY `idx_line_tenant_status` (`tenant_id`,`status`),
  KEY `idx_line_workshop` (`tenant_id`,`workshop_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='生产流水线管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_production_line`
--

LOCK TABLES `biz_production_line` WRITE;
/*!40000 ALTER TABLE `biz_production_line` DISABLE KEYS */;
INSERT INTO `biz_production_line` VALUES ('PL0001','000000','LINE-SMT-01','SMT贴片一线','电子装配一车间','SMT贴片线','智能控制主板','王建国','两班倒',12000,10860,18,26,98.72,91.35,'running','主要承接控制板批量贴装任务','U0001','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0002','000000','LINE-SMT-02','SMT贴片二线','电子装配一车间','SMT贴片线','传感器采集板','李志强','两班倒',10000,9230,16,24,98.41,88.60,'running','近期订单稳定，夜班产能略有波动','U0001','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0003','000000','LINE-DIP-01','DIP插件一线','电子装配二车间','插件焊接线','电源控制模块','赵海峰','两班倒',6500,5980,12,32,97.85,86.42,'running','插件岗位人员已满编','U0002','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0004','000000','LINE-DIP-02','DIP插件二线','电子装配二车间','插件焊接线','通讯扩展模块','陈晓东','白班',5200,4360,10,25,97.12,80.26,'running','部分工位需补充治具','U0002','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0005','000000','LINE-ASSY-01','整机装配一线','总装一车间','整机装配线','工业数据采集终端','刘春明','两班倒',1800,1650,22,45,99.10,92.18,'running','核心交付产线，优先保障物料','U0003','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0006','000000','LINE-ASSY-02','整机装配二线','总装一车间','整机装配线','智能网关设备','孙立军','两班倒',1600,1425,20,41,98.96,89.54,'running','本周切换新工艺版本','U0003','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0007','000000','LINE-TEST-01','功能测试一线','测试中心','功能测试线','工业网关成品测试','周永亮','两班倒',2200,2045,28,30,99.42,93.70,'running','自动测试工装运行正常','U0004','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0008','000000','LINE-TEST-02','老化测试二线','测试中心','老化测试线','传感器老化测试','马建平','三班倒',3500,3180,36,18,99.05,87.92,'running','高温老化箱已完成点检','U0004','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0009','000000','LINE-PACK-01','包装一线','包装车间','包装线','标准成品包装','杨磊','白班',3000,2860,8,22,99.60,94.20,'running','包装耗材库存充足','U0005','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0010','000000','LINE-PACK-02','包装二线','包装车间','包装线','出口订单包装','胡凯','白班',2400,1980,7,20,99.30,81.44,'running','出口标签需人工复核','U0005','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0011','000000','LINE-CNC-01','CNC精加工一线','机加工车间','CNC加工线','铝合金外壳','蒋国华','两班倒',4200,3860,15,19,96.85,88.75,'running','刀具寿命需加强跟踪','U0006','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0012','000000','LINE-CNC-02','CNC精加工二线','机加工车间','CNC加工线','散热器结构件','许文斌','两班倒',3800,3260,14,17,96.20,79.60,'maintenance','主轴保养中，预计今晚恢复','U0006','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0013','000000','LINE-INJ-01','注塑一线','注塑车间','注塑线','ABS塑胶外壳','黄志远','三班倒',9000,8420,10,16,97.50,90.80,'running','模温机运行稳定','U0007','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0014','000000','LINE-INJ-02','注塑二线','注塑车间','注塑线','阻燃端子外壳','郭明','三班倒',7800,6950,9,15,96.90,84.35,'running','夜班换模频率较高','U0007','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0015','000000','LINE-SPRAY-01','喷涂一线','表面处理车间','喷涂线','金属外壳喷涂','曹旭','白班',3600,2980,11,21,95.60,76.40,'maintenance','喷房过滤棉更换中','U0008','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0016','000000','LINE-LASER-01','激光打标一线','包装车间','标识打码线','产品铭牌打标','魏强','白班',5200,4870,6,10,99.80,93.50,'running','二维码识别率稳定','U0008','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0017','000000','LINE-QC-01','来料检验线','品质中心','质检线','电子元器件检验','沈丽','白班',15000,13600,12,28,98.20,85.10,'running','重点检验芯片与连接器','U0009','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0018','000000','LINE-QC-02','成品抽检线','品质中心','质检线','成品可靠性抽检','邹洁','白班',2600,2310,9,16,99.15,88.00,'running','本月客诉批次加严抽检','U0009','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0019','000000','LINE-REPAIR-01','返修分析线','维修中心','返修线','异常品分析维修','方涛','白班',600,430,8,12,92.40,68.30,'idle','等待上一批异常品复判','U0010','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
INSERT INTO `biz_production_line` VALUES ('PL0020','000000','LINE-AUTO-01','自动化装配试验线','智能制造试验区','自动化试产线','新款边缘计算盒','韩启明','白班',900,520,24,8,96.30,58.40,'running','新产品小批量试产阶段','U0010','2026-06-17 07:50:40','2026-06-17 07:50:40',0);
/*!40000 ALTER TABLE `biz_production_line` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_sales_record`
--

DROP TABLE IF EXISTS `biz_sales_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_sales_record` (
  `sales_id` varchar(32) NOT NULL COMMENT '销售记录ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `sales_no` varchar(64) NOT NULL COMMENT '销售单号',
  `order_no` varchar(64) DEFAULT NULL COMMENT '关联订单号',
  `customer_name` varchar(120) NOT NULL COMMENT '客户名称',
  `product_code` varchar(64) NOT NULL COMMENT '产品编码',
  `product_name` varchar(120) NOT NULL COMMENT '产品名称',
  `sales_quantity` int NOT NULL COMMENT '销售数量',
  `unit_price` decimal(12,2) NOT NULL COMMENT '销售单价',
  `sales_amount` decimal(14,2) NOT NULL COMMENT '销售金额',
  `sales_date` date NOT NULL COMMENT '销售日期',
  `sales_region` varchar(50) DEFAULT NULL COMMENT '销售区域',
  `sales_channel` varchar(50) DEFAULT NULL COMMENT '销售渠道',
  `sales_owner` varchar(50) DEFAULT NULL COMMENT '销售负责人',
  `delivery_status` varchar(30) DEFAULT 'pending' COMMENT '发货状态',
  `invoice_status` varchar(30) DEFAULT 'not_invoiced' COMMENT '开票状态',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`sales_id`),
  UNIQUE KEY `uk_sales_tenant_no` (`tenant_id`,`sales_no`),
  KEY `idx_sales_tenant_date` (`tenant_id`,`sales_date`),
  KEY `idx_sales_customer` (`tenant_id`,`customer_name`),
  KEY `idx_sales_product` (`tenant_id`,`product_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='销售管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_sales_record`
--

LOCK TABLES `biz_sales_record` WRITE;
/*!40000 ALTER TABLE `biz_sales_record` DISABLE KEYS */;
INSERT INTO `biz_sales_record` VALUES ('SAL0001','000000','SAL20260502001','SO20260501001','苏州恒远智能装备有限公司','PRD-GW-1001','工业物联网网关',60,1280.00,76800.00,'2026-05-02','华东','老客户复购','林晓峰','partial','partial','首批60台已发货','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0002','000000','SAL20260506002','SO20260506004','上海联川机电工程有限公司','PRD-PWR-4101','24V工业电源模块',300,236.00,70800.00,'2026-05-06','华东','展会线索','林晓峰','shipped','invoiced','已完成发货与开票','U0001','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0003','000000','SAL20260508003','SO20260508005','嘉兴锐拓包装机械有限公司','PRD-SEN-3101','温湿度采集传感器',250,168.00,42000.00,'2026-05-08','华东','老客户复购','陈嘉伟','partial','not_invoiced','首批传感器已出库','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0004','000000','SAL20260512004','SO20260512007','南京智控系统集成有限公司','PRD-MOD-8201','模拟量采集模块',80,580.00,46400.00,'2026-05-12','华东','渠道订单','王诗雨','partial','partial','随货提供检测报告','U0002','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0005','000000','SAL20260514005','SO20260514008','常州华科机器人有限公司','PRD-BOX-6201','高性能边缘计算盒',18,4680.00,84240.00,'2026-05-14','华东','战略客户','陈嘉伟','partial','partial','客户分两批安装','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0006','000000','SAL20260518006','SO20260518010','绍兴远景纺织机械有限公司','PRD-SEN-3201','振动监测传感器',240,420.00,100800.00,'2026-05-18','华东','售后增购','林晓峰','shipped','invoiced','全量交付完成','U0003','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0007','000000','SAL20260522007','SO20260522012','天津博远自动化设备有限公司','PRD-PLC-2100','小型PLC控制器',60,860.00,51600.00,'2026-05-22','华北','老客户复购','王诗雨','partial','not_invoiced','首批60台发货','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0008','000000','SAL20260526008','SO20260526014','武汉盛达工业技术有限公司','PRD-CAM-9101','工业视觉相机',13,2980.00,38740.00,'2026-05-26','华中','展会线索','陈嘉伟','pending','not_invoiced','等待配套镜头到货','U0004','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0009','000000','SAL20260528009','SO20260528015','郑州中原装备制造有限公司','PRD-PWR-4201','48V工业电源模块',180,398.00,71640.00,'2026-05-28','华中','渠道订单','王诗雨','shipped','invoiced','项目急单已优先发货','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0010','000000','SAL20260530010','SO20260530016','东莞宏泰电子科技有限公司','PRD-MOD-8101','IO扩展模块',100,318.00,31800.00,'2026-05-30','华南','老客户复购','林晓峰','partial','not_invoiced','首批100个已发货','U0005','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0011','000000','SAL20260601011','SO20260601017','深圳云控科技有限公司','PRD-BOX-6101','边缘计算盒',16,2680.00,42880.00,'2026-06-01','华南','战略客户','陈嘉伟','pending','not_invoiced','等待客户确认系统镜像','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0012','000000','SAL20260605012','SO20260605019','佛山精联陶瓷设备有限公司','PRD-NEW-9901','智能能耗采集终端',50,1580.00,79000.00,'2026-06-05','华南','售后增购','林晓峰','partial','partial','试点订单首批交付','U0006','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0013','000000','SAL20260606013',NULL,'苏州明诚自动化有限公司','PRD-HMI-5101','7寸工业触摸屏',20,1360.00,27200.00,'2026-06-06','华东','现货销售','王诗雨','shipped','not_invoiced','客户临时补货','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0014','000000','SAL20260607014',NULL,'上海聚能设备工程有限公司','PRD-PWR-4101','24V工业电源模块',120,236.00,28320.00,'2026-06-07','华东','现货销售','林晓峰','shipped','invoiced','常规备件销售','U0007','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0015','000000','SAL20260608015',NULL,'南京恒科智能装备有限公司','PRD-GW-1001','工业物联网网关',25,1280.00,32000.00,'2026-06-08','华东','代理商订单','陈嘉伟','pending','not_invoiced','等待仓库拣货','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0016','000000','SAL20260609016',NULL,'杭州森川环保设备有限公司','PRD-SEN-3101','温湿度采集传感器',180,168.00,30240.00,'2026-06-09','华东','官网询盘','王诗雨','shipped','not_invoiced','用于环保设备温湿度监控','U0008','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0017','000000','SAL20260610017',NULL,'青岛奥普智能科技有限公司','PRD-PLC-2200','高性能PLC控制器',18,1460.00,26280.00,'2026-06-10','华北','渠道订单','林晓峰','pending','not_invoiced','客户要求下周统一发货','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0018','000000','SAL20260611018',NULL,'重庆新航工业技术有限公司','PRD-CAB-7101','标准控制柜',6,3280.00,19680.00,'2026-06-11','西南','项目订单','陈嘉伟','pending','not_invoiced','柜体包装需加固','U0009','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0019','000000','SAL20260612019',NULL,'成都华创自动化有限公司','PRD-MOD-8201','模拟量采集模块',45,580.00,26100.00,'2026-06-12','西南','老客户复购','王诗雨','shipped','partial','客户账期开票','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
INSERT INTO `biz_sales_record` VALUES ('SAL0020','000000','SAL20260613020',NULL,'厦门精研电子有限公司','PRD-CAM-9201','高速工业视觉相机',5,5260.00,26300.00,'2026-06-13','华南','官网询盘','林晓峰','pending','not_invoiced','等待技术确认镜头接口','U0010','2026-06-17 07:50:41','2026-06-17 07:50:41',0);
/*!40000 ALTER TABLE `biz_sales_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_config`
--

DROP TABLE IF EXISTS `sys_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_config` (
  `config_id` varchar(32) NOT NULL COMMENT '参数ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `config_key` varchar(100) NOT NULL COMMENT '参数键名',
  `config_value` text NOT NULL COMMENT '参数键值',
  `config_name` varchar(100) NOT NULL COMMENT '参数名称',
  `config_type` varchar(20) NOT NULL DEFAULT 'sys' COMMENT 'sys/theme/dict',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`),
  UNIQUE KEY `uk_config_tenant_key` (`tenant_id`,`config_key`),
  KEY `idx_config_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统参数表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_config`
--

LOCK TABLES `sys_config` WRITE;
/*!40000 ALTER TABLE `sys_config` DISABLE KEYS */;
INSERT INTO `sys_config` VALUES ('000401','000000','sys.user.defaultPassword','123456','默认密码','sys','0','新用户默认密码',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('000402','000000','sys.app.name','BLS Management System','系统名称','sys','0','前后端展示名称',0,'2026-06-11 00:58:56','2026-06-15 02:33:47');
INSERT INTO `sys_config` VALUES ('000403','000000','sys.demo.enabled','true','演示模式开关','sys','0','是否开启演示数据',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('000404','000000','sys.upload.maxSize','20','文件上传限制(MB)','sys','0','文件上传大小限制，默认大小50MB',0,'2026-06-11 00:58:56','2026-06-17 03:08:19');
INSERT INTO `sys_config` VALUES ('000405','000000','sys.version','0.0.1','版本号','sys','0','系统版本',0,'2026-06-11 00:58:56','2026-06-15 02:34:08');
INSERT INTO `sys_config` VALUES ('100401','100000','sys.app.name','默认租户工作台','系统名称','sys','0','默认租户展示名称',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('324733162540371968','000000','sys.app.logo','https://xux.xlcig.cn/logo.png','系统Logo','sys','0','请在文件管理上传后复制-使用公开桶',0,'2026-06-15 02:13:40','2026-06-16 06:59:33');
INSERT INTO `sys_config` VALUES ('324735307117367296','000000','sys.user.defaultAvatar','https://i.scdn.co/image/ab67616d00001e020c1faab9fa6c0b91f9f4e465','用户默认头像','sys','0','用户未设置头像时使用',0,'2026-06-15 02:22:11','2026-06-15 02:25:33');
INSERT INTO `sys_config` VALUES ('324800409917067264','000000','sys.login.multiDevice','1','多开登录','sys','0','1 = 允许多开；0 = 只允许单端。默认1',0,'2026-06-15 06:40:52','2026-06-17 09:21:29');
/*!40000 ALTER TABLE `sys_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dept`
--

DROP TABLE IF EXISTS `sys_dept`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dept` (
  `dept_id` varchar(32) NOT NULL COMMENT '部门ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父部门ID，000000表示根节点',
  `dept_name` varchar(50) NOT NULL COMMENT '部门名称',
  `sort_num` int DEFAULT '0' COMMENT '排序',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0未删除 1已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`dept_id`),
  KEY `idx_dept_tenant` (`tenant_id`),
  KEY `idx_dept_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dept`
--

LOCK TABLES `sys_dept` WRITE;
/*!40000 ALTER TABLE `sys_dept` DISABLE KEYS */;
INSERT INTO `sys_dept` VALUES ('000001','000000','000000','平台总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100001','100000','000000','默认租户总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100002','100000','100001','技术部',2,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100003','100000','100001','运营部',3,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('323381860459745280','000000','000000','行政部',1,'0',0,'2026-06-11 08:44:03','2026-06-17 07:27:07');
INSERT INTO `sys_dept` VALUES ('323719748447768576','000000','323381860459745280','暴风雪',0,'0',0,'2026-06-12 07:06:42','2026-06-12 07:06:42');
INSERT INTO `sys_dept` VALUES ('325536879892107264','000000','000000','财务部',0,'0',0,'2026-06-17 07:27:21','2026-06-17 07:27:21');
INSERT INTO `sys_dept` VALUES ('325536911462633472','000000','000000','生产部',0,'0',0,'2026-06-17 07:27:28','2026-06-17 07:27:28');
INSERT INTO `sys_dept` VALUES ('325536948397674496','000000','000000','市场部',0,'0',0,'2026-06-17 07:27:37','2026-06-17 07:27:37');
INSERT INTO `sys_dept` VALUES ('325537043469963264','000000','325536948397674496','售前部',0,'0',0,'2026-06-17 07:28:00','2026-06-17 07:28:30');
INSERT INTO `sys_dept` VALUES ('325537094283956224','000000','325536948397674496','销售部',0,'0',0,'2026-06-17 07:28:12','2026-06-17 07:28:12');
INSERT INTO `sys_dept` VALUES ('325537143713828864','000000','325536948397674496','售后部',0,'0',0,'2026-06-17 07:28:24','2026-06-17 07:28:24');
/*!40000 ALTER TABLE `sys_dept` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `dict_data_id` varchar(32) NOT NULL COMMENT '字典数据ID',
  `dict_type_id` varchar(32) NOT NULL COMMENT '字典类型ID',
  `dict_label` varchar(100) NOT NULL COMMENT '字典标签',
  `dict_value` varchar(100) NOT NULL COMMENT '字典值',
  `dict_sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_data_id`),
  KEY `idx_dict_data_type` (`dict_type_id`),
  KEY `idx_dict_data_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='字典数据表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
INSERT INTO `sys_dict_data` VALUES ('000301','000201','男','0',1,'0','男','000000',0,'2026-06-11 00:58:56','2026-06-12 03:22:59');
INSERT INTO `sys_dict_data` VALUES ('000302','000201','女','1',2,'0','女','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000303','000201','未知','2',3,'0','未知','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000304','000202','正常','0',1,'0','正常','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000305','000202','停用','1',2,'0','停用','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000306','000203','目录','0',1,'0','目录','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000307','000203','菜单','1',2,'0','菜单','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000308','000203','按钮','2',3,'0','按钮','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000309','000204','是','1',1,'0','是','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000310','000204','否','0',2,'0','否','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000311','000205','系统参数','sys',1,'0','系统参数','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000312','000205','主题配置','theme',2,'0','主题配置','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000313','000205','字典数据','dict',3,'0','字典数据','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000314','000206','密码登录','password',1,'0','用户名密码登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000315','000206','刷新令牌','refresh',2,'0','refreshToken 刷新','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000316','000206','验证码登录','sms',3,'0','短信验证码登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000317','000206','单点登录','sso',4,'0','SSO 登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000318','000207','登录','LOGIN',1,'0','登录操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000319','000207','退出','LOGOUT',2,'0','退出操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000320','000207','新增','ADD',3,'0','新增操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000321','000207','修改','UPDATE',4,'0','修改操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000322','000207','删除','DELETE',5,'0','删除操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000323','000207','上传','UPLOAD',6,'0','上传操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000324','000207','下载','DOWNLOAD',7,'0','下载操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000325','000207','导出','EXPORT',8,'0','导出操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000326','000207','其他','OTHER',9,'0','其他操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000327','000208','成功','1',1,'0','上传成功','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_data` VALUES ('000328','000208','失败','0',2,'0','上传失败','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_data` VALUES ('000329','000209','公开','public',1,'0','公开访问','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_data` VALUES ('000330','000209','私有','private',2,'0','私有访问','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_data` VALUES ('324832469079691264','324832179827904512','MinIO','minio',0,'0','MinIO分布式','000000',0,'2026-06-15 08:48:16','2026-06-15 08:48:16');
INSERT INTO `sys_dict_data` VALUES ('324832566806974464','324832179827904512','阿里云 OSS','aliyun_oss',1,'0','阿里云 OSS 文件服务','000000',0,'2026-06-15 08:48:39','2026-06-15 08:48:39');
INSERT INTO `sys_dict_data` VALUES ('324832642832928768','324832179827904512','腾讯云 COS','tencent_cos',2,'0','腾讯云 COS 文件服务','000000',0,'2026-06-15 08:48:57','2026-06-15 08:48:57');
INSERT INTO `sys_dict_data` VALUES ('324832716900143104','324832179827904512','七牛云 Kodo','qiniu_kodo',3,'0','七牛云 Kodo','000000',0,'2026-06-15 08:49:15','2026-06-15 08:49:15');
INSERT INTO `sys_dict_data` VALUES ('324832816439365632','324832179827904512','华为云 OBS','huawei_obs',4,'0','遥遥领先，远远超越','000000',0,'2026-06-15 08:49:38','2026-06-15 08:50:07');
INSERT INTO `sys_dict_data` VALUES ('324832897687228416','324832179827904512','AWS S3','aws_s3',5,'0','AWS S3','000000',0,'2026-06-15 08:49:58','2026-06-15 08:49:58');
INSERT INTO `sys_dict_data` VALUES ('324833081074782208','324832179827904512','本地存储','local',99,'0','本地存储(测试环境','000000',0,'2026-06-15 08:50:41','2026-06-15 08:50:41');
INSERT INTO `sys_dict_data` VALUES ('325153647082213376','325153530858049536','公共桶','public',1,'0','公开可访问文件','000000',0,'2026-06-16 06:04:30','2026-06-16 06:04:30');
INSERT INTO `sys_dict_data` VALUES ('325153773272043520','325153530858049536','私有桶','private',2,'0','需鉴权或签名访问文件','000000',0,'2026-06-16 06:05:00','2026-06-16 06:05:00');
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `dict_type_id` varchar(32) NOT NULL COMMENT '字典类型ID',
  `dict_name` varchar(100) NOT NULL COMMENT '字典名称',
  `dict_type` varchar(100) NOT NULL COMMENT '字典类型',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_type_id`),
  UNIQUE KEY `uk_dict_type_tenant` (`tenant_id`,`dict_type`),
  KEY `idx_dict_type_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='字典类型表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
INSERT INTO `sys_dict_type` VALUES ('000201','性别','sys_gender','0','用户性别字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000202','状态','sys_status','0','通用状态字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000203','菜单类型','sys_menu_type','0','菜单类型字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000204','是否','sys_yes_no','0','是否字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000205','配置类型','sys_config_type','0','系统配置类型','000000',0,'2026-06-11 00:58:56','2026-06-12 03:12:04');
INSERT INTO `sys_dict_type` VALUES ('000206','登录类型','sys_login_type','0','系统登录方式','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_type` VALUES ('000207','业务类型','sys_business_type','0','系统操作业务类型','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_type` VALUES ('000208','上传状态','sys_upload_status','0','文件上传结果状态','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_type` VALUES ('000209','访问类型','sys_access_type','0','上传文件访问类型','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_type` VALUES ('324832179827904512','OSS类型配置','sys_storage_type','0','minio|阿里云|腾讯云...','000000',0,'2026-06-15 08:47:07','2026-06-15 08:47:07');
INSERT INTO `sys_dict_type` VALUES ('325153530858049536','桶访问类型','sys_bucket_access_type','0','用于区分文件上传到公共桶或私有桶','000000',0,'2026-06-16 06:04:03','2026-06-16 06:04:03');
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_file`
--

DROP TABLE IF EXISTS `sys_file`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_file` (
  `file_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件ID',
  `tenant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '租户ID',
  `storage_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储配置ID',
  `bucket_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '桶名称',
  `object_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对象路径',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件名',
  `file_ext` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件后缀',
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MIME类型',
  `file_size` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `access_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private' COMMENT 'public/private',
  `module_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务模块',
  `url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共文件URL，私有文件为空',
  `create_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`file_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_storage_id` (`storage_id`),
  KEY `idx_bucket_object` (`bucket_name`,`object_name`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_module_name` (`module_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件资源表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_file`
--

LOCK TABLES `sys_file` WRITE;
/*!40000 ALTER TABLE `sys_file` DISABLE KEYS */;
INSERT INTO `sys_file` VALUES ('325151909738582016','000000','000001','private-assets','头像/1781589455662_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'private','头像',NULL,NULL,'2026-06-16 05:57:36',NULL,'2026-06-16 05:57:36',0);
INSERT INTO `sys_file` VALUES ('325155265907396608','000000','000001','public-assets','头像/1781590255855_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781590255855_images.jpg',NULL,'2026-06-16 06:10:56',NULL,'2026-06-16 06:10:56',0);
INSERT INTO `sys_file` VALUES ('325441325367431168','000000','000001','private-assets','头像/1781658458065_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:07:38',NULL,'2026-06-17 01:10:20',1);
INSERT INTO `sys_file` VALUES ('325441335437955072','000000','000001','private-assets','头像/1781658460626_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:07:41',NULL,'2026-06-17 01:10:17',1);
INSERT INTO `sys_file` VALUES ('325441758840360960','000000','000001','private-assets','头像/1781658561442_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:09:22',NULL,'2026-06-17 01:10:14',1);
INSERT INTO `sys_file` VALUES ('325441924779610112','000000','000001','private-assets','头像/1781658600976_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:10:01',NULL,'2026-06-17 01:10:11',1);
INSERT INTO `sys_file` VALUES ('325442039544156160','000000','000001','public-assets','头像/1781658628415_sanjiao@2x.png','sanjiao@2x.png','sanjiao@2x.png','png','image/png',454,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781658628415_sanjiao@2x.png',NULL,'2026-06-17 01:10:29',NULL,'2026-06-17 01:10:29',0);
INSERT INTO `sys_file` VALUES ('325452100014313472','000000','000001','public-assets','头像/1781661026961_jian@2x.png','jian@2x.png','jian@2x.png','png','image/png',702,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781661026961_jian@2x.png',NULL,'2026-06-17 01:50:27',NULL,'2026-06-17 01:50:27',0);
INSERT INTO `sys_file` VALUES ('325456136671203328','000000','000001','public-assets','avatar/1781661989382_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','avatar','https://s3.minion.xlcig.cn/public-assets/avatar/1781661989382_images.jpg',NULL,'2026-06-17 02:06:30',NULL,'2026-06-17 02:06:30',0);
INSERT INTO `sys_file` VALUES ('325456179692179456','000000','000001','public-assets','avatar/1781661999673_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','avatar','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg',NULL,'2026-06-17 02:06:40',NULL,'2026-06-17 02:06:40',0);
/*!40000 ALTER TABLE `sys_file` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_global_search_config`
--

DROP TABLE IF EXISTS `sys_global_search_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_global_search_config` (
  `search_id` varchar(32) NOT NULL COMMENT '搜索配置ID',
  `module_key` varchar(64) NOT NULL COMMENT '模块标识',
  `module_name` varchar(64) NOT NULL COMMENT '模块名称',
  `permission` varchar(128) NOT NULL COMMENT '全局搜索权限标识',
  `route_path` varchar(255) DEFAULT NULL COMMENT '前端跳转路径',
  `source_table` varchar(128) DEFAULT NULL COMMENT '来源业务表',
  `biz_id_field` varchar(128) DEFAULT NULL COMMENT '业务主键字段',
  `title_field` varchar(128) DEFAULT NULL COMMENT '标题字段',
  `subtitle_field` varchar(128) DEFAULT NULL COMMENT '副标题字段',
  `content_fields` varchar(1000) DEFAULT NULL COMMENT '内容字段，逗号分隔',
  `tenant_field` varchar(64) DEFAULT 'tenant_id' COMMENT '租户字段',
  `owner_field` varchar(64) DEFAULT NULL COMMENT '负责人字段',
  `dept_field` varchar(64) DEFAULT NULL COMMENT '部门字段',
  `created_by_field` varchar(64) DEFAULT 'created_by' COMMENT '创建人字段',
  `status_field` varchar(64) DEFAULT 'status' COMMENT '状态字段',
  `deleted_field` varchar(64) DEFAULT 'deleted' COMMENT '删除字段',
  `enabled` tinyint DEFAULT '1' COMMENT '是否启用：1启用 0停用',
  `sort` int DEFAULT '0' COMMENT '排序',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`search_id`),
  UNIQUE KEY `uk_search_module` (`module_key`),
  KEY `idx_search_config_enabled` (`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局搜索配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_global_search_config`
--

LOCK TABLES `sys_global_search_config` WRITE;
/*!40000 ALTER TABLE `sys_global_search_config` DISABLE KEYS */;
INSERT INTO `sys_global_search_config` VALUES ('GS_CONFIG','config','系统参数','system:config:search','/system/config','sys_config','config_id','config_name','config_key','config_name,config_key,config_value,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,70,'系统参数全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_DEPT','dept','部门管理','system:dept:search','/system/dept','sys_dept','dept_id','dept_name',NULL,'dept_name','tenant_id',NULL,NULL,'create_by','status','deleted',1,40,'部门管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_DICT_DATA','dict-data','字典数据','system:dict:search','/system/dict','sys_dict_data','dict_data_id','dict_label','dict_value','dict_label,dict_value,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,60,'字典数据全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_DICT_TYPE','dict-type','字典类型','system:dict:search','/system/dict','sys_dict_type','dict_type_id','dict_name','dict_type','dict_name,dict_type,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,50,'字典类型全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_FILE','file','文件管理','system:file:search','/system/storage','sys_file','file_id','original_name','file_name','original_name,file_name,object_name,module_name','tenant_id',NULL,NULL,'create_by',NULL,'deleted',1,120,'文件管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_LOG_LOGIN','log-login','登录日志','system:log:search','/system/log','sys_log_login','log_id','username','login_type','username,login_type,ipaddr,location,os,browser,msg','tenant_id',NULL,NULL,'create_by','status','deleted',1,130,'登录日志全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_LOG_OPERATION','log-operation','操作日志','system:log:search','/system/log','sys_log_operation','oper_id','title','business_type','title,business_type,oper_name,request_method,oper_url','tenant_id',NULL,NULL,'create_by','status','deleted',1,140,'操作日志全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_MENU','menu','菜单管理','system:menu:search','/system/menu','sys_menu','menu_id','menu_name','perms','menu_name,path,component,perms',NULL,NULL,NULL,'create_by','status','deleted',1,30,'菜单管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_PACKAGE','package','套餐管理','system:package:search','/system/package','sys_package','package_id','package_name','package_code','package_name,package_code,remark',NULL,NULL,NULL,'create_by','status','deleted',1,90,'套餐管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_PAGE_CONFIG','page-config','页面配置','system:page-config:search','/system/page-config','sys_page_config','page_config_id','page_name','page_code','page_name,page_code,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,110,'页面配置全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_ROLE','role','角色管理','system:role:search','/system/role','sys_role','role_id','role_name','role_key','role_name,role_key,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,20,'角色管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_TENANT','tenant','租户管理','system:tenant:search','/system/tenant','sys_tenant','tenant_id','tenant_name','tenant_name','tenant_name,domain_name,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,80,'租户管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_THEME','theme','主题配置','system:theme:search','/system/theme','sys_theme','theme_id','theme_name','theme_key','theme_name,theme_key,remark','tenant_id',NULL,NULL,'create_by','status','deleted',1,100,'主题配置全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
INSERT INTO `sys_global_search_config` VALUES ('GS_USER','user','用户管理','system:user:search','/system/user','sys_user','user_id','username','nickname','username,nickname,real_name,phone,email','tenant_id',NULL,'dept_id','create_by','status','deleted',1,10,'用户管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');
/*!40000 ALTER TABLE `sys_global_search_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_login_log`
--

DROP TABLE IF EXISTS `sys_login_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_login_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `login_type` varchar(20) NOT NULL DEFAULT 'password' COMMENT '登录方式：password/otp/sms/oauth等',
  `login_status` char(1) NOT NULL DEFAULT '1' COMMENT '登录状态：1成功 0失败',
  `fail_reason` varchar(500) DEFAULT NULL COMMENT '失败原因',
  `login_ip` varchar(45) DEFAULT NULL COMMENT '登录IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `login_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  PRIMARY KEY (`log_id`),
  KEY `idx_login_log_tenant_time` (`tenant_id`,`login_time`),
  KEY `idx_login_log_user_time` (`user_id`,`login_time`),
  KEY `idx_login_log_status` (`login_status`),
  KEY `idx_login_log_request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='登录日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_login_log`
--

LOCK TABLES `sys_login_log` WRITE;
/*!40000 ALTER TABLE `sys_login_log` DISABLE KEYS */;
INSERT INTO `sys_login_log` VALUES ('325522806764867584','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 06:31:25');
INSERT INTO `sys_login_log` VALUES ('325526706855219200','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 06:46:55');
INSERT INTO `sys_login_log` VALUES ('325531365657415680','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 07:05:26');
INSERT INTO `sys_login_log` VALUES ('325536736702763008','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 07:26:47');
INSERT INTO `sys_login_log` VALUES ('325543494095605760','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 07:53:38');
INSERT INTO `sys_login_log` VALUES ('325547892846759936','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 08:11:06');
INSERT INTO `sys_login_log` VALUES ('325549562859229184','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 08:17:45');
INSERT INTO `sys_login_log` VALUES ('325554295007219712','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 08:36:33');
INSERT INTO `sys_login_log` VALUES ('325561651384422400','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 09:05:47');
INSERT INTO `sys_login_log` VALUES ('325565118098313216','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 09:19:33');
INSERT INTO `sys_login_log` VALUES ('325565503353524224','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 09:21:05');
INSERT INTO `sys_login_log` VALUES ('325565721197285376','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 09:21:57');
INSERT INTO `sys_login_log` VALUES ('325803729603399680','000000',NULL,' superadmin','password','0','租户、用户名或密码错误',NULL,NULL,NULL,'2026-06-18 01:07:44');
INSERT INTO `sys_login_log` VALUES ('325804006679121920','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 01:08:50');
INSERT INTO `sys_login_log` VALUES ('325873514542403584','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 05:45:00');
INSERT INTO `sys_login_log` VALUES ('325878281180155904','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 06:03:56');
INSERT INTO `sys_login_log` VALUES ('325885774564298752','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 06:33:43');
INSERT INTO `sys_login_log` VALUES ('325910076563001344','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 08:10:17');
INSERT INTO `sys_login_log` VALUES ('325913303647916032','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 08:23:07');
INSERT INTO `sys_login_log` VALUES ('325917881185472512','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 08:41:18');
INSERT INTO `sys_login_log` VALUES ('325922060054433792','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 08:57:54');
INSERT INTO `sys_login_log` VALUES ('325926558588080128','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 09:15:47');
INSERT INTO `sys_login_log` VALUES ('325930490227986432','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-18 09:31:24');
INSERT INTO `sys_login_log` VALUES ('327260289139609600','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 01:35:34');
INSERT INTO `sys_login_log` VALUES ('327265616396423168','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 01:56:44');
INSERT INTO `sys_login_log` VALUES ('327274864522170368','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 02:33:29');
INSERT INTO `sys_login_log` VALUES ('327278641291595776','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 02:48:30');
INSERT INTO `sys_login_log` VALUES ('327283650267844608','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 03:08:24');
INSERT INTO `sys_login_log` VALUES ('327287720592412672','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 03:24:34');
INSERT INTO `sys_login_log` VALUES ('327292046773719040','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 03:41:46');
INSERT INTO `sys_login_log` VALUES ('327323628364500992','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 05:47:14');
INSERT INTO `sys_login_log` VALUES ('327327215136149504','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 06:01:29');
INSERT INTO `sys_login_log` VALUES ('327327534633062400','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-22 06:02:45');
INSERT INTO `sys_login_log` VALUES ('327331723404775424','000000','000001','superadmin','password','1',NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,'2026-06-22 06:19:24');
INSERT INTO `sys_login_log` VALUES ('327337331969363968','000000','000001','superadmin','password','1',NULL,NULL,'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,'2026-06-22 06:41:41');
INSERT INTO `sys_login_log` VALUES ('327341267530944512','000000','000001','superadmin','password','1',NULL,NULL,'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,'2026-06-22 06:57:20');
INSERT INTO `sys_login_log` VALUES ('327347048552730624','000000','000001','superadmin','password','1',NULL,NULL,'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,'2026-06-22 07:20:18');
/*!40000 ALTER TABLE `sys_login_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID，全局菜单',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父菜单ID，000000表示根节点',
  `menu_name` varchar(50) NOT NULL COMMENT '菜单名称',
  `path` varchar(200) DEFAULT NULL COMMENT '路由路径',
  `component` varchar(200) DEFAULT NULL COMMENT '组件路径',
  `perms` varchar(100) DEFAULT NULL COMMENT '权限标识',
  `icon` varchar(100) DEFAULT NULL COMMENT '图标',
  `menu_type` char(1) NOT NULL DEFAULT '1' COMMENT '0目录 1菜单 2按钮',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`menu_id`),
  KEY `idx_menu_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局菜单表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES ('000100','000000','系统管理','/system',NULL,NULL,'SettingOutlined','0',30,'0','2026-06-11 00:58:56','2026-06-17 08:05:37');
INSERT INTO `sys_menu` VALUES ('000110','000000','租户管理','/tenant',NULL,NULL,'UsergroupAddOutlined','0',40,'0','2026-06-11 00:58:56','2026-06-17 08:05:50');
INSERT INTO `sys_menu` VALUES ('000111','000110','租户列表','/tenant/list','system/tenant-package/tenant','system:tenant:list','UsergroupDeleteOutlined','1',1,'0','2026-06-11 00:58:56','2026-06-16 01:46:18');
INSERT INTO `sys_menu` VALUES ('000112','000110','租户套餐','/tenant/package','system/tenant-package/package','system:package:list','SketchOutlined','1',2,'0','2026-06-11 00:58:56','2026-06-16 01:46:18');
INSERT INTO `sys_menu` VALUES ('000113','000111','查询',NULL,NULL,'system:tenant:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000114','000111','新增',NULL,NULL,'system:tenant:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000115','000111','修改',NULL,NULL,'system:tenant:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000116','000111','删除',NULL,NULL,'system:tenant:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000117','000112','查询',NULL,NULL,'system:package:list',NULL,'2',1,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000118','000112','新增',NULL,NULL,'system:package:add',NULL,'2',2,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000119','000112','修改',NULL,NULL,'system:package:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('00011A','000112','删除',NULL,NULL,'system:package:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000120','000100','部门管理','/system/dept','system/dept','system:dept:list',NULL,'1',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000121','000120','查询',NULL,NULL,'system:dept:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000122','000120','新增',NULL,NULL,'system:dept:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000123','000120','修改',NULL,NULL,'system:dept:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000124','000120','删除',NULL,NULL,'system:dept:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000130','000100','用户管理','/system/user','system/user','system:user:list',NULL,'1',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000131','000130','查询',NULL,NULL,'system:user:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000132','000130','新增',NULL,NULL,'system:user:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000133','000130','修改',NULL,NULL,'system:user:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000134','000130','删除',NULL,NULL,'system:user:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000135','000130','重置密码',NULL,NULL,'system:user:resetPwd',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000140','000100','角色管理','/system/role','system/role','system:role:list',NULL,'1',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000141','000140','查询',NULL,NULL,'system:role:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000142','000140','新增',NULL,NULL,'system:role:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000143','000140','修改',NULL,NULL,'system:role:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000144','000140','删除',NULL,NULL,'system:role:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000145','000140','分配菜单',NULL,NULL,'system:role:assignMenu',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000150','000100','菜单管理','/system/menu','system/menu','system:menu:list',NULL,'1',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000151','000150','查询',NULL,NULL,'system:menu:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000152','000150','新增',NULL,NULL,'system:menu:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000153','000150','修改',NULL,NULL,'system:menu:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000154','000150','删除',NULL,NULL,'system:menu:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000160','000100','系统参数','/system/config','system/config','system:config:list',NULL,'1',6,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000161','000160','查询',NULL,NULL,'system:config:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000162','000160','新增',NULL,NULL,'system:config:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000163','000160','修改',NULL,NULL,'system:config:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000170','000100','字典管理','/system/dict','system/dict','system:dict:list',NULL,'1',7,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000171','000170','查询',NULL,NULL,'system:dict:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000172','000170','新增',NULL,NULL,'system:dict:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000173','000170','修改',NULL,NULL,'system:dict:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000174','000170','删除',NULL,NULL,'system:dict:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000180','000100','主题配置','/system/theme','system/theme','system:theme:list',NULL,'1',8,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000181','000180','查询',NULL,NULL,'system:theme:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000182','000180','修改',NULL,NULL,'system:theme:edit',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000190','000100','日志中心','/system/log',NULL,NULL,'FileSearchOutlined','0',8,'0','2026-06-16 09:05:28','2026-06-16 09:05:28');
INSERT INTO `sys_menu` VALUES ('000191','000190','登录日志','/system/log/login','system/log/login','system:log:login:list','LoginOutlined','1',1,'0','2026-06-16 09:05:35','2026-06-16 09:05:35');
INSERT INTO `sys_menu` VALUES ('000192','000190','操作审计','/system/log/audit','system/log/audit','system:log:audit:list','AuditOutlined','1',2,'0','2026-06-16 09:05:40','2026-06-16 09:05:40');
INSERT INTO `sys_menu` VALUES ('000193','000191','查询',NULL,NULL,'system:log:login:list',NULL,'2',1,'0','2026-06-16 09:05:45','2026-06-16 09:05:45');
INSERT INTO `sys_menu` VALUES ('000194','000191','导出',NULL,NULL,'system:log:login:export',NULL,'2',2,'0','2026-06-16 09:05:45','2026-06-16 09:05:45');
INSERT INTO `sys_menu` VALUES ('000195','000192','查询',NULL,NULL,'system:log:audit:list',NULL,'2',1,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000196','000192','导出',NULL,NULL,'system:log:audit:export',NULL,'2',2,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000197','000192','查看详情',NULL,NULL,'system:log:audit:detail',NULL,'2',3,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000198','000192','清理',NULL,NULL,'system:log:audit:clean',NULL,'2',4,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('325518182582456320','000130','全局搜索',NULL,NULL,'system:user:search',NULL,'2',0,'0','2026-06-17 06:13:03','2026-06-17 06:13:03');
INSERT INTO `sys_menu` VALUES ('325518338505707520','000140','全局搜索',NULL,NULL,'system:role:search',NULL,'2',0,'0','2026-06-17 06:13:40','2026-06-17 06:13:40');
INSERT INTO `sys_menu` VALUES ('325518440133693440','000150','全局搜索',NULL,NULL,'system:menu:search',NULL,'1',0,'0','2026-06-17 06:14:04','2026-06-17 06:14:04');
INSERT INTO `sys_menu` VALUES ('325883052729438208','000100','页面配置','/system/page-config','system/page-config','system:pageconfig:list',NULL,'1',0,'1','2026-06-18 06:22:54','2026-06-22 06:58:54');
INSERT INTO `sys_menu` VALUES ('327266832077688832','000120','全局搜索',NULL,NULL,'system:dept:search',NULL,'2',0,'0','2026-06-22 02:01:34','2026-06-22 02:01:34');
INSERT INTO `sys_menu` VALUES ('327267036847804416','000160','全局搜索',NULL,NULL,'system:config:search',NULL,'2',0,'0','2026-06-22 02:02:23','2026-06-22 02:02:23');
INSERT INTO `sys_menu` VALUES ('327267207878938624','000170','全局搜索',NULL,NULL,'system:dict:search',NULL,'1',0,'0','2026-06-22 02:03:04','2026-06-22 02:03:04');
INSERT INTO `sys_menu` VALUES ('327267345460498432','000192','全局搜索',NULL,NULL,'system:log:search',NULL,'2',0,'0','2026-06-22 02:03:36','2026-06-22 02:03:36');
INSERT INTO `sys_menu` VALUES ('327267400540098560','000191','全局搜索',NULL,NULL,'system:log:search',NULL,'2',0,'0','2026-06-22 02:03:50','2026-06-22 02:03:50');
INSERT INTO `sys_menu` VALUES ('business_finance_0001','000000','财务管理','/business/finance','business/finance','business:finance:list','FundOutlined','1',4,'0','2026-06-17 07:53:29','2026-06-17 08:01:13');
INSERT INTO `sys_menu` VALUES ('business_finance_add_0001','business_finance_0001','新增',NULL,NULL,'business:finance:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_finance_edit_0001','business_finance_0001','修改',NULL,NULL,'business:finance:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_finance_export_0001','business_finance_0001','导出',NULL,NULL,'business:finance:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_finance_query_0001','business_finance_0001','查询',NULL,NULL,'business:finance:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_finance_remove_0001','business_finance_0001','删除',NULL,NULL,'business:finance:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_inventory_0001','000000','库存管理','/business/inventory','business/inventory','business:inventory:list','StockOutlined','1',6,'0','2026-06-17 07:53:29','2026-06-17 08:03:38');
INSERT INTO `sys_menu` VALUES ('business_inventory_add_0001','business_inventory_0001','新增',NULL,NULL,'business:inventory:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_inventory_edit_0001','business_inventory_0001','修改',NULL,NULL,'business:inventory:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_inventory_export_0001','business_inventory_0001','导出',NULL,NULL,'business:inventory:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_inventory_query_0001','business_inventory_0001','查询',NULL,NULL,'business:inventory:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_inventory_remove_0001','business_inventory_0001','删除',NULL,NULL,'business:inventory:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_order_0001','000000','订单管理','/business/order','business/order','business:order:list','OrderedListOutlined','1',2,'0','2026-06-17 07:53:29','2026-06-17 07:59:29');
INSERT INTO `sys_menu` VALUES ('business_order_add_0001','business_order_0001','新增',NULL,NULL,'business:order:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_order_edit_0001','business_order_0001','修改',NULL,NULL,'business:order:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_order_export_0001','business_order_0001','导出',NULL,NULL,'business:order:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_order_query_0001','business_order_0001','查询',NULL,NULL,'business:order:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_order_remove_0001','business_order_0001','删除',NULL,NULL,'business:order:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_product_0001','000000','产品管理','/business/product','business/product','business:product:list','ProductOutlined','1',3,'0','2026-06-17 07:53:29','2026-06-17 08:00:07');
INSERT INTO `sys_menu` VALUES ('business_product_add_0001','business_product_0001','新增',NULL,NULL,'business:product:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_product_edit_0001','business_product_0001','修改',NULL,NULL,'business:product:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_product_export_0001','business_product_0001','导出',NULL,NULL,'business:product:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_product_query_0001','business_product_0001','查询',NULL,NULL,'business:product:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_product_remove_0001','business_product_0001','删除',NULL,NULL,'business:product:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_sales_0001','000000','销售管理','/business/sales','business/sales','business:sales:list','AccountBookOutlined','1',5,'0','2026-06-17 07:53:29','2026-06-17 08:03:15');
INSERT INTO `sys_menu` VALUES ('business_sales_add_0001','business_sales_0001','新增',NULL,NULL,'business:sales:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_sales_edit_0001','business_sales_0001','修改',NULL,NULL,'business:sales:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_sales_export_0001','business_sales_0001','导出',NULL,NULL,'business:sales:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_sales_query_0001','business_sales_0001','查询',NULL,NULL,'business:sales:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('business_sales_remove_0001','business_sales_0001','删除',NULL,NULL,'business:sales:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('file_center_0001','000000','文件中心','/file-config',NULL,NULL,'FolderOutlined','0',30,'0','2026-06-15 08:40:58','2026-06-16 01:57:23');
INSERT INTO `sys_menu` VALUES ('file_manage_0001','file_center_0001','文件管理','/file-config/files','system/file-config/files','system:file:list','FileOutlined','1',2,'0','2026-06-15 08:41:06','2026-06-16 01:57:24');
INSERT INTO `sys_menu` VALUES ('file_manage_download_0001','file_manage_0001','下载',NULL,NULL,'system:file:download',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('file_manage_remove_0001','file_manage_0001','删除',NULL,NULL,'system:file:remove',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('file_manage_upload_0001','file_manage_0001','上传',NULL,NULL,'system:file:upload',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('production_line_0001','000000','生产管理','/business/production-line','business/production-line','business:production-line:list','ApartmentOutlined','1',1,'0','2026-06-17 07:53:29','2026-06-17 07:58:40');
INSERT INTO `sys_menu` VALUES ('production_line_add_0001','production_line_0001','新增',NULL,NULL,'business:production-line:add',NULL,'2',2,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('production_line_edit_0001','production_line_0001','修改',NULL,NULL,'business:production-line:edit',NULL,'2',3,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('production_line_export_0001','production_line_0001','导出',NULL,NULL,'business:production-line:export',NULL,'2',5,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('production_line_query_0001','production_line_0001','查询',NULL,NULL,'business:production-line:query',NULL,'2',1,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('production_line_remove_0001','production_line_0001','删除',NULL,NULL,'business:production-line:remove',NULL,'2',4,'0','2026-06-17 07:53:29','2026-06-17 07:53:29');
INSERT INTO `sys_menu` VALUES ('storage_config_0001','file_center_0001','存储配置','/file-config/storage','system/file-config/storage','system:storage:list','DatabaseOutlined','1',1,'0','2026-06-15 08:41:06','2026-06-16 01:57:24');
INSERT INTO `sys_menu` VALUES ('storage_config_add_0001','storage_config_0001','新增',NULL,NULL,'system:storage:add',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('storage_config_edit_0001','storage_config_0001','修改',NULL,NULL,'system:storage:edit',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('storage_config_remove_0001','storage_config_0001','删除',NULL,NULL,'system:storage:remove',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_operation_log`
--

DROP TABLE IF EXISTS `sys_operation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_operation_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `business_type` varchar(30) NOT NULL COMMENT '业务类型：LOGIN/ADD/UPDATE/DELETE/UPLOAD/DOWNLOAD/EXPORT/OTHER',
  `title` varchar(200) NOT NULL COMMENT '操作标题',
  `request_method` varchar(10) DEFAULT NULL COMMENT '请求方法',
  `request_url` varchar(500) DEFAULT NULL COMMENT '请求URL',
  `request_params` longtext COMMENT '请求参数',
  `response_status` int DEFAULT NULL COMMENT '响应状态码',
  `success` tinyint NOT NULL DEFAULT '1' COMMENT '是否成功：1成功 0失败',
  `error_message` varchar(1000) DEFAULT NULL COMMENT '错误信息',
  `error_stack` longtext COMMENT '错误堆栈',
  `client_ip` varchar(45) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `cost_time_ms` int DEFAULT NULL COMMENT '耗时毫秒',
  `operator_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`log_id`),
  KEY `idx_op_log_tenant_time` (`tenant_id`,`operator_time`),
  KEY `idx_op_log_user_time` (`user_id`,`operator_time`),
  KEY `idx_op_log_business_type` (`business_type`),
  KEY `idx_op_log_request_id` (`request_id`),
  KEY `idx_op_log_success` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统操作日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_operation_log`
--

LOCK TABLES `sys_operation_log` WRITE;
/*!40000 ALTER TABLE `sys_operation_log` DISABLE KEYS */;
INSERT INTO `sys_operation_log` VALUES ('325196342748123136','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"configType\":\"sys\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:10',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196381868396544','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196388944187392','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:21',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196406535098368','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:25',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196457344897024','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:37',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196469692928000','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:40',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196827299287040','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:56:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196885780467712','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:56:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325197328753496064','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"324800409917067264\",\"configKey\":\"sys.login.multiDevice\",\"configValue\":\"1\",\"configName\":\"多开登录\",\"configType\":\"sys\",\"remark\":\"1 = 允许多开；0 = 只允许单端。默认1\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:58:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325197330666098688','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:58:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325199656332169216','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:07:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325200161372508160','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:09:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201751634481152','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"324800409917067264\",\"configKey\":\"sys.login.multiDevice\",\"configValue\":\"0\",\"configName\":\"多开登录\",\"configType\":\"sys\",\"remark\":\"1 = 允许多开；0 = 只允许单端。默认1\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:39',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201815501148160','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201823025729537','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204475516162049','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:29',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204578276610048','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:53',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204584450625536','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207479376023552','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P100/menus','{\"packageId\":\"P100\",\"menuIds\":[\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000161\",\"000162\",\"000163\",\"000181\",\"000182\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"000120\",\"000130\",\"000140\",\"000160\",\"000180\",\"file_manage_0001\",\"000110\",\"000111\",\"000112\",\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000100\",\"000150\",\"000170\",\"000190\",\"000151\",\"000152\",\"000153\",\"000154\",\"000171\",\"000172\",\"000173\",\"000174\",\"000191\",\"000192\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_center_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:38:25',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207608845799424','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P100/menus','{\"packageId\":\"P100\",\"menuIds\":[\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000161\",\"000162\",\"000163\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"000191\",\"000192\",\"000120\",\"000130\",\"000140\",\"000160\",\"000180\",\"000190\",\"file_manage_0001\",\"000100\",\"file_center_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:38:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207635819368448','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000111\",\"000112\",\"000120\",\"000130\",\"000140\",\"000150\",\"000160\",\"000170\",\"000180\",\"storage_config_0001\",\"file_manage_0001\",\"000110\",\"file_center_0001\",\"000100\",\"000190\",\"000191\",\"000192\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:39:02',NULL);
INSERT INTO `sys_operation_log` VALUES ('325208998750064641','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:44:27',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209058665697281','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:44:42',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209846943191040','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:47:50',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209871546978304','100000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:47:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212368219017216','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:57:51',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212454063837184','100000','100001','admin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:58:11',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212476180402176','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:58:16',NULL);
INSERT INTO `sys_operation_log` VALUES ('325213240726523904','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:01:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325213250184679424','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:01:21',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215156797837313','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:08:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215475124539392','000000',NULL,NULL,'auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',NULL,NULL,'2026-06-16 10:10:11',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215508507004929','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',NULL,NULL,'2026-06-16 10:10:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325440799624007681','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:05:33',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441968102576128','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441924779610112','{\"fileId\":\"325441924779610112\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:12',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441980823900160','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441758840360960','{\"fileId\":\"325441758840360960\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:15',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441992127549440','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441335437955072','{\"fileId\":\"325441335437955072\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:17',NULL);
INSERT INTO `sys_operation_log` VALUES ('325442003577999360','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441325367431168','{\"fileId\":\"325441325367431168\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325442746976440320','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:13:17',NULL);
INSERT INTO `sys_operation_log` VALUES ('325448041559625728','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:34:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325449677040390144','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"remark\":null,\"avatar\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:40:50',NULL);
INSERT INTO `sys_operation_log` VALUES ('325451340836900864','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":null,\"gender\":\"0\",\"email\":null,\"phone\":null,\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:47:26',NULL);
INSERT INTO `sys_operation_log` VALUES ('325451373195956224','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:47:34',NULL);
INSERT INTO `sys_operation_log` VALUES ('325454959099383808','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:01:49',NULL);
INSERT INTO `sys_operation_log` VALUES ('325455000325197824','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:01:59',NULL);
INSERT INTO `sys_operation_log` VALUES ('325456286172975104','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":\"https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg\",\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:07:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325466241189941248','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:46:39',NULL);
INSERT INTO `sys_operation_log` VALUES ('325470582688845824','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 03:03:54',NULL);
INSERT INTO `sys_operation_log` VALUES ('325471693189550080','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"000404\",\"configKey\":\"sys.upload.maxSize\",\"configValue\":\"20\",\"configName\":\"文件上传限制(MB)\",\"configType\":\"sys\",\"remark\":\"文件上传大小限制，默认大小50MB\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 03:08:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325481364608651264','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 03:46:45',NULL);
INSERT INTO `sys_operation_log` VALUES ('325522807159132160','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 06:31:25',NULL);
INSERT INTO `sys_operation_log` VALUES ('325526707236900864','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 06:46:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325531366034903040','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:05:26',NULL);
INSERT INTO `sys_operation_log` VALUES ('325536737071861760','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:26:47',NULL);
INSERT INTO `sys_operation_log` VALUES ('325536823193505792','000000','000001','superadmin','dept','UPDATE','修改部门','PUT','/api/system/dept/edit','{\"deptId\":\"323381860459745280\",\"parentId\":\"000000\",\"deptName\":\"行政部\",\"sortNum\":1,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:27:07',NULL);
INSERT INTO `sys_operation_log` VALUES ('325536880277983232','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"000000\",\"deptName\":\"财务部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:27:21',NULL);
INSERT INTO `sys_operation_log` VALUES ('325536911831732224','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"000000\",\"deptName\":\"生产部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:27:28',NULL);
INSERT INTO `sys_operation_log` VALUES ('325536948599001088','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"000000\",\"deptName\":\"市场部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:27:37',NULL);
INSERT INTO `sys_operation_log` VALUES ('325537043839062016','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"325536948397674496\",\"deptName\":\"售前\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:28:00',NULL);
INSERT INTO `sys_operation_log` VALUES ('325537094648860672','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"325536948397674496\",\"deptName\":\"销售部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:28:12',NULL);
INSERT INTO `sys_operation_log` VALUES ('325537143910961152','000000','000001','superadmin','dept','ADD','新增部门','POST','/api/system/dept/add','{\"parentId\":\"325536948397674496\",\"deptName\":\"售后部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:28:24',NULL);
INSERT INTO `sys_operation_log` VALUES ('325537169739485184','000000','000001','superadmin','dept','UPDATE','修改部门','PUT','/api/system/dept/edit','{\"deptId\":\"325537043469963264\",\"parentId\":\"325536948397674496\",\"deptName\":\"售前部\",\"sortNum\":0,\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:28:30',NULL);
INSERT INTO `sys_operation_log` VALUES ('325538791861391360','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000191\",\"000192\",\"000120\",\"000160\",\"000170\",\"000190\",\"000180\",\"000111\",\"000112\",\"storage_config_0001\",\"file_manage_0001\",\"000110\",\"file_center_0001\",\"000130\",\"325518182582456320\",\"000140\",\"325518338505707520\",\"000150\",\"325518440133693440\",\"000100\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:34:57',NULL);
INSERT INTO `sys_operation_log` VALUES ('325543494481481728','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:53:38',NULL);
INSERT INTO `sys_operation_log` VALUES ('325543527654232064','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"325518182582456320\",\"325518338505707520\",\"325518440133693440\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000191\",\"000192\",\"000120\",\"000130\",\"000140\",\"000150\",\"000160\",\"000170\",\"000180\",\"000190\",\"000111\",\"000112\",\"storage_config_0001\",\"file_manage_0001\",\"000100\",\"000110\",\"file_center_0001\",\"biz_center_0001\",\"production_line_0001\",\"business_order_0001\",\"business_product_0001\",\"business_finance_0001\",\"business_sales_0001\",\"business_inventory_0001\",\"production_line_query_0001\",\"production_line_add_0001\",\"production_line_edit_0001\",\"production_line_remove_0001\",\"production_line_export_0001\",\"business_order_query_0001\",\"business_order_add_0001\",\"business_order_edit_0001\",\"business_order_remove_0001\",\"business_order_export_0001\",\"business_product_query_0001\",\"business_product_add_0001\",\"business_product_edit_0001\",\"business_product_remove_0001\",\"business_product_export_0001\",\"business_finance_query_0001\",\"business_finance_add_0001\",\"business_finance_edit_0001\",\"business_finance_remove_0001\",\"business_finance_export_0001\",\"business_sales_query_0001\",\"business_sales_add_0001\",\"business_sales_edit_0001\",\"business_sales_remove_0001\",\"business_sales_export_0001\",\"business_inventory_query_0001\",\"business_inventory_add_0001\",\"business_inventory_edit_0001\",\"business_inventory_remove_0001\",\"business_inventory_export_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 07:53:46',NULL);
INSERT INTO `sys_operation_log` VALUES ('325547893228441600','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 08:11:07',NULL);
INSERT INTO `sys_operation_log` VALUES ('325549563261882368','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 08:17:45',NULL);
INSERT INTO `sys_operation_log` VALUES ('325554295405678592','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 08:36:33',NULL);
INSERT INTO `sys_operation_log` VALUES ('325561651757715456','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 09:05:47',NULL);
INSERT INTO `sys_operation_log` VALUES ('325564970945351680','000000',NULL,NULL,'auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Linux; Android 16; VER-AN10 Build/HONORVER-AN20P; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20260202 MMWEBID/1221 REV/89918ef4d19865ac6236e9f77c99567b0ec6d85b MicroMessenger/8.0.70.3060(0x28004652) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64',NULL,NULL,'2026-06-17 09:18:58',NULL);
INSERT INTO `sys_operation_log` VALUES ('325565118459023360','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf254193e) XWEB/19841 Flue',NULL,NULL,'2026-06-17 09:19:33',NULL);
INSERT INTO `sys_operation_log` VALUES ('325565503714234368','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 09:21:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325565604872458240','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"324800409917067264\",\"configKey\":\"sys.login.multiDevice\",\"configValue\":\"1\",\"configName\":\"多开登录\",\"configType\":\"sys\",\"remark\":\"1 = 允许多开；0 = 只允许单端。默认1\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 09:21:29',NULL);
INSERT INTO `sys_operation_log` VALUES ('325565721591549952','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (OHOS; OHOS x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) UnifiedPCOHOSWechat(0xf2b40127) XWEB/13171 Flue',NULL,NULL,'2026-06-17 09:21:57',NULL);
INSERT INTO `sys_operation_log` VALUES ('325803730303848448','000000',NULL,NULL,'auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf2541a35) XWEB/20001 Flue',NULL,NULL,'2026-06-18 01:07:44',NULL);
INSERT INTO `sys_operation_log` VALUES ('325804006914002944','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 01:08:50',NULL);
INSERT INTO `sys_operation_log` VALUES ('325873514961833984','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 05:45:00',NULL);
INSERT INTO `sys_operation_log` VALUES ('325878281553448960','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 06:03:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325883338671919104','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"325518182582456320\",\"325518338505707520\",\"325518440133693440\",\"business_finance_add_0001\",\"business_finance_edit_0001\",\"business_finance_export_0001\",\"business_finance_query_0001\",\"business_finance_remove_0001\",\"business_inventory_add_0001\",\"business_inventory_edit_0001\",\"business_inventory_export_0001\",\"business_inventory_query_0001\",\"business_inventory_remove_0001\",\"business_order_add_0001\",\"business_order_edit_0001\",\"business_order_export_0001\",\"business_order_query_0001\",\"business_order_remove_0001\",\"business_product_add_0001\",\"business_product_edit_0001\",\"business_product_export_0001\",\"business_product_query_0001\",\"business_product_remove_0001\",\"business_sales_add_0001\",\"business_sales_edit_0001\",\"business_sales_export_0001\",\"business_sales_query_0001\",\"business_sales_remove_0001\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"production_line_add_0001\",\"production_line_edit_0001\",\"production_line_export_0001\",\"production_line_query_0001\",\"production_line_remove_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000191\",\"000192\",\"000120\",\"000130\",\"000140\",\"000150\",\"000160\",\"000170\",\"000180\",\"000190\",\"storage_config_0001\",\"file_manage_0001\",\"000111\",\"000112\",\"production_line_0001\",\"business_order_0001\",\"business_product_0001\",\"business_finance_0001\",\"business_sales_0001\",\"business_inventory_0001\",\"file_center_0001\",\"000110\",\"000100\",\"325883052729438208\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 06:24:02',NULL);
INSERT INTO `sys_operation_log` VALUES ('325885774958563328','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 06:33:43',NULL);
INSERT INTO `sys_operation_log` VALUES ('325910076948877312','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 08:10:17',NULL);
INSERT INTO `sys_operation_log` VALUES ('325913304012820480','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 08:23:07',NULL);
INSERT INTO `sys_operation_log` VALUES ('325917881567154176','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 08:41:18',NULL);
INSERT INTO `sys_operation_log` VALUES ('325922060478058496','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 08:57:54',NULL);
INSERT INTO `sys_operation_log` VALUES ('325926558961373184','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 09:15:47',NULL);
INSERT INTO `sys_operation_log` VALUES ('325930490588696576','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 09:31:24',NULL);
INSERT INTO `sys_operation_log` VALUES ('325932887000092672','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P100/menus','{\"packageId\":\"P100\",\"menuIds\":[\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000161\",\"000162\",\"000163\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_manage_download_0001\",\"file_manage_upload_0001\",\"000191\",\"000192\",\"000120\",\"000160\",\"000180\",\"000190\",\"production_line_0001\",\"production_line_query_0001\",\"production_line_add_0001\",\"production_line_edit_0001\",\"production_line_remove_0001\",\"production_line_export_0001\",\"business_order_0001\",\"business_order_query_0001\",\"business_order_add_0001\",\"business_order_edit_0001\",\"business_order_remove_0001\",\"business_order_export_0001\",\"business_product_0001\",\"business_product_query_0001\",\"business_product_add_0001\",\"business_product_edit_0001\",\"business_product_remove_0001\",\"business_product_export_0001\",\"business_finance_0001\",\"business_finance_query_0001\",\"business_finance_add_0001\",\"business_finance_edit_0001\",\"business_finance_remove_0001\",\"business_finance_export_0001\",\"business_sales_0001\",\"business_sales_query_0001\",\"business_sales_add_0001\",\"business_sales_edit_0001\",\"business_sales_remove_0001\",\"business_sales_export_0001\",\"business_inventory_0001\",\"business_inventory_query_0001\",\"business_inventory_add_0001\",\"business_inventory_edit_0001\",\"business_inventory_remove_0001\",\"business_inventory_export_0001\",\"file_manage_remove_0001\",\"file_manage_0001\",\"000130\",\"000140\",\"000100\",\"file_center_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-18 09:40:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('327260289529679872','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 01:35:34',NULL);
INSERT INTO `sys_operation_log` VALUES ('327265616794882048','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 01:56:44',NULL);
INSERT INTO `sys_operation_log` VALUES ('327267731105779712','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"325518182582456320\",\"325518338505707520\",\"325518440133693440\",\"325883052729438208\",\"business_finance_add_0001\",\"business_finance_edit_0001\",\"business_finance_export_0001\",\"business_finance_query_0001\",\"business_finance_remove_0001\",\"business_inventory_add_0001\",\"business_inventory_edit_0001\",\"business_inventory_export_0001\",\"business_inventory_query_0001\",\"business_inventory_remove_0001\",\"business_order_add_0001\",\"business_order_edit_0001\",\"business_order_export_0001\",\"business_order_query_0001\",\"business_order_remove_0001\",\"business_product_add_0001\",\"business_product_edit_0001\",\"business_product_export_0001\",\"business_product_query_0001\",\"business_product_remove_0001\",\"business_sales_add_0001\",\"business_sales_edit_0001\",\"business_sales_export_0001\",\"business_sales_query_0001\",\"business_sales_remove_0001\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"production_line_add_0001\",\"production_line_edit_0001\",\"production_line_export_0001\",\"production_line_query_0001\",\"production_line_remove_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000130\",\"000140\",\"000150\",\"000180\",\"storage_config_0001\",\"file_manage_0001\",\"000111\",\"000112\",\"production_line_0001\",\"business_order_0001\",\"business_product_0001\",\"business_finance_0001\",\"business_sales_0001\",\"business_inventory_0001\",\"file_center_0001\",\"000110\",\"000100\",\"000120\",\"000160\",\"000170\",\"000190\",\"327266832077688832\",\"327267036847804416\",\"327267207878938624\",\"000191\",\"000192\",\"327267400540098560\",\"327267345460498432\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 02:05:08',NULL);
INSERT INTO `sys_operation_log` VALUES ('327268173957173248','000000','000001','superadmin','user','ADD','新增用户','POST','/api/system/user/add','{\"username\":\"globalSearch\",\"nickname\":\"测试全局搜索\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795075@163.com\",\"phone\":\"18569795075\",\"deptId\":\"325536911462633472\",\"isAdmin\":\"0\",\"status\":\"0\",\"roleIds\":[\"323642966914764800\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 02:06:54',NULL);
INSERT INTO `sys_operation_log` VALUES ('327274864941600768','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 02:33:29',NULL);
INSERT INTO `sys_operation_log` VALUES ('327278641799106560','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 02:48:30',NULL);
INSERT INTO `sys_operation_log` VALUES ('327283650670497792','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 03:08:24',NULL);
INSERT INTO `sys_operation_log` VALUES ('327287721007648768','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 03:24:34',NULL);
INSERT INTO `sys_operation_log` VALUES ('327292047151206400','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 03:41:46',NULL);
INSERT INTO `sys_operation_log` VALUES ('327323628741988352','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 05:47:14',NULL);
INSERT INTO `sys_operation_log` VALUES ('327327215337476096','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 06:01:29',NULL);
INSERT INTO `sys_operation_log` VALUES ('327327535006355456','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 06:02:45',NULL);
INSERT INTO `sys_operation_log` VALUES ('327331723849371648','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 06:19:24',NULL);
INSERT INTO `sys_operation_log` VALUES ('327337332346851328','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 06:41:41',NULL);
INSERT INTO `sys_operation_log` VALUES ('327341267887460352','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 06:57:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('327347048917635072','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-22 07:20:18',NULL);
/*!40000 ALTER TABLE `sys_operation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_package`
--

DROP TABLE IF EXISTS `sys_package`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `package_name` varchar(100) NOT NULL COMMENT '套餐名称',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_package`
--

LOCK TABLES `sys_package` WRITE;
/*!40000 ALTER TABLE `sys_package` DISABLE KEYS */;
INSERT INTO `sys_package` VALUES ('P001','0','0','000000 平台租户使用，拥有全部菜单权限','2026-06-11 00:58:56','2026-06-12 02:05:18');
INSERT INTO `sys_package` VALUES ('P100','租户标准版套餐','0','普通租户标准版，默认不包含租户管理','2026-06-11 00:58:56','2026-06-11 00:58:56');
/*!40000 ALTER TABLE `sys_package` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_package_menu`
--

DROP TABLE IF EXISTS `sys_package_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package_menu` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`package_id`,`menu_id`),
  KEY `idx_package_menu_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐菜单关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_package_menu`
--

LOCK TABLES `sys_package_menu` WRITE;
/*!40000 ALTER TABLE `sys_package_menu` DISABLE KEYS */;
INSERT INTO `sys_package_menu` VALUES ('P001','000100');
INSERT INTO `sys_package_menu` VALUES ('P100','000100');
INSERT INTO `sys_package_menu` VALUES ('P001','000110');
INSERT INTO `sys_package_menu` VALUES ('P001','000111');
INSERT INTO `sys_package_menu` VALUES ('P001','000112');
INSERT INTO `sys_package_menu` VALUES ('P001','000113');
INSERT INTO `sys_package_menu` VALUES ('P001','000114');
INSERT INTO `sys_package_menu` VALUES ('P001','000115');
INSERT INTO `sys_package_menu` VALUES ('P001','000116');
INSERT INTO `sys_package_menu` VALUES ('P001','000117');
INSERT INTO `sys_package_menu` VALUES ('P001','000118');
INSERT INTO `sys_package_menu` VALUES ('P001','000119');
INSERT INTO `sys_package_menu` VALUES ('P001','00011A');
INSERT INTO `sys_package_menu` VALUES ('P001','000120');
INSERT INTO `sys_package_menu` VALUES ('P100','000120');
INSERT INTO `sys_package_menu` VALUES ('P001','000121');
INSERT INTO `sys_package_menu` VALUES ('P100','000121');
INSERT INTO `sys_package_menu` VALUES ('P001','000122');
INSERT INTO `sys_package_menu` VALUES ('P100','000122');
INSERT INTO `sys_package_menu` VALUES ('P001','000123');
INSERT INTO `sys_package_menu` VALUES ('P100','000123');
INSERT INTO `sys_package_menu` VALUES ('P001','000124');
INSERT INTO `sys_package_menu` VALUES ('P100','000124');
INSERT INTO `sys_package_menu` VALUES ('P001','000130');
INSERT INTO `sys_package_menu` VALUES ('P100','000130');
INSERT INTO `sys_package_menu` VALUES ('P001','000131');
INSERT INTO `sys_package_menu` VALUES ('P100','000131');
INSERT INTO `sys_package_menu` VALUES ('P001','000132');
INSERT INTO `sys_package_menu` VALUES ('P100','000132');
INSERT INTO `sys_package_menu` VALUES ('P001','000133');
INSERT INTO `sys_package_menu` VALUES ('P100','000133');
INSERT INTO `sys_package_menu` VALUES ('P001','000134');
INSERT INTO `sys_package_menu` VALUES ('P100','000134');
INSERT INTO `sys_package_menu` VALUES ('P001','000135');
INSERT INTO `sys_package_menu` VALUES ('P100','000135');
INSERT INTO `sys_package_menu` VALUES ('P001','000140');
INSERT INTO `sys_package_menu` VALUES ('P100','000140');
INSERT INTO `sys_package_menu` VALUES ('P001','000141');
INSERT INTO `sys_package_menu` VALUES ('P100','000141');
INSERT INTO `sys_package_menu` VALUES ('P001','000142');
INSERT INTO `sys_package_menu` VALUES ('P100','000142');
INSERT INTO `sys_package_menu` VALUES ('P001','000143');
INSERT INTO `sys_package_menu` VALUES ('P100','000143');
INSERT INTO `sys_package_menu` VALUES ('P001','000144');
INSERT INTO `sys_package_menu` VALUES ('P100','000144');
INSERT INTO `sys_package_menu` VALUES ('P001','000145');
INSERT INTO `sys_package_menu` VALUES ('P100','000145');
INSERT INTO `sys_package_menu` VALUES ('P001','000150');
INSERT INTO `sys_package_menu` VALUES ('P001','000151');
INSERT INTO `sys_package_menu` VALUES ('P001','000152');
INSERT INTO `sys_package_menu` VALUES ('P001','000153');
INSERT INTO `sys_package_menu` VALUES ('P001','000154');
INSERT INTO `sys_package_menu` VALUES ('P001','000160');
INSERT INTO `sys_package_menu` VALUES ('P100','000160');
INSERT INTO `sys_package_menu` VALUES ('P001','000161');
INSERT INTO `sys_package_menu` VALUES ('P100','000161');
INSERT INTO `sys_package_menu` VALUES ('P001','000162');
INSERT INTO `sys_package_menu` VALUES ('P100','000162');
INSERT INTO `sys_package_menu` VALUES ('P001','000163');
INSERT INTO `sys_package_menu` VALUES ('P100','000163');
INSERT INTO `sys_package_menu` VALUES ('P001','000170');
INSERT INTO `sys_package_menu` VALUES ('P001','000171');
INSERT INTO `sys_package_menu` VALUES ('P001','000172');
INSERT INTO `sys_package_menu` VALUES ('P001','000173');
INSERT INTO `sys_package_menu` VALUES ('P001','000174');
INSERT INTO `sys_package_menu` VALUES ('P001','000180');
INSERT INTO `sys_package_menu` VALUES ('P100','000180');
INSERT INTO `sys_package_menu` VALUES ('P001','000181');
INSERT INTO `sys_package_menu` VALUES ('P100','000181');
INSERT INTO `sys_package_menu` VALUES ('P001','000182');
INSERT INTO `sys_package_menu` VALUES ('P100','000182');
INSERT INTO `sys_package_menu` VALUES ('P001','000190');
INSERT INTO `sys_package_menu` VALUES ('P100','000190');
INSERT INTO `sys_package_menu` VALUES ('P001','000191');
INSERT INTO `sys_package_menu` VALUES ('P100','000191');
INSERT INTO `sys_package_menu` VALUES ('P001','000192');
INSERT INTO `sys_package_menu` VALUES ('P100','000192');
INSERT INTO `sys_package_menu` VALUES ('P001','000193');
INSERT INTO `sys_package_menu` VALUES ('P100','000193');
INSERT INTO `sys_package_menu` VALUES ('P001','000194');
INSERT INTO `sys_package_menu` VALUES ('P100','000194');
INSERT INTO `sys_package_menu` VALUES ('P001','000195');
INSERT INTO `sys_package_menu` VALUES ('P100','000195');
INSERT INTO `sys_package_menu` VALUES ('P001','000196');
INSERT INTO `sys_package_menu` VALUES ('P100','000196');
INSERT INTO `sys_package_menu` VALUES ('P001','000197');
INSERT INTO `sys_package_menu` VALUES ('P100','000197');
INSERT INTO `sys_package_menu` VALUES ('P001','000198');
INSERT INTO `sys_package_menu` VALUES ('P100','000198');
INSERT INTO `sys_package_menu` VALUES ('P001','325518182582456320');
INSERT INTO `sys_package_menu` VALUES ('P001','325518338505707520');
INSERT INTO `sys_package_menu` VALUES ('P001','325518440133693440');
INSERT INTO `sys_package_menu` VALUES ('P001','325883052729438208');
INSERT INTO `sys_package_menu` VALUES ('P001','327266832077688832');
INSERT INTO `sys_package_menu` VALUES ('P001','327267036847804416');
INSERT INTO `sys_package_menu` VALUES ('P001','327267207878938624');
INSERT INTO `sys_package_menu` VALUES ('P001','327267345460498432');
INSERT INTO `sys_package_menu` VALUES ('P001','327267400540098560');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_finance_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_finance_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_inventory_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_inventory_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_order_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_order_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_product_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_product_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','business_sales_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','business_sales_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_center_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_center_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_download_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_download_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_upload_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_upload_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_export_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_query_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','production_line_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','production_line_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_remove_0001');
/*!40000 ALTER TABLE `sys_package_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `role_name` varchar(50) NOT NULL COMMENT '角色名称',
  `role_key` varchar(50) NOT NULL COMMENT '角色标识',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uk_role_tenant_key` (`tenant_id`,`role_key`),
  KEY `idx_role_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES ('000001','000000','超级管理员','admin',1,'0','平台超级管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('100001','100000','租户管理员','tenant_admin',1,'0','默认租户管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('100002','100000','普通用户','user',2,'0','默认租户普通用户角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('323300594838278144','000000','用户A','user:A',1,'0','普通用户',0,'2026-06-11 03:21:08','2026-06-11 03:21:08');
INSERT INTO `sys_role` VALUES ('323304627162451968','000000','用户B','用户B',0,'0',NULL,0,'2026-06-11 03:37:09','2026-06-11 03:37:09');
INSERT INTO `sys_role` VALUES ('323642966914764800','000000','用户C','用户c',0,'0',NULL,0,'2026-06-12 02:01:36','2026-06-12 06:33:14');
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色菜单关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES ('000001','000100');
INSERT INTO `sys_role_menu` VALUES ('000001','000110');
INSERT INTO `sys_role_menu` VALUES ('000001','000111');
INSERT INTO `sys_role_menu` VALUES ('000001','000112');
INSERT INTO `sys_role_menu` VALUES ('000001','000113');
INSERT INTO `sys_role_menu` VALUES ('000001','000114');
INSERT INTO `sys_role_menu` VALUES ('000001','000115');
INSERT INTO `sys_role_menu` VALUES ('000001','000116');
INSERT INTO `sys_role_menu` VALUES ('000001','000117');
INSERT INTO `sys_role_menu` VALUES ('000001','000118');
INSERT INTO `sys_role_menu` VALUES ('000001','000119');
INSERT INTO `sys_role_menu` VALUES ('000001','00011A');
INSERT INTO `sys_role_menu` VALUES ('000001','000120');
INSERT INTO `sys_role_menu` VALUES ('000001','000121');
INSERT INTO `sys_role_menu` VALUES ('000001','000122');
INSERT INTO `sys_role_menu` VALUES ('000001','000123');
INSERT INTO `sys_role_menu` VALUES ('000001','000124');
INSERT INTO `sys_role_menu` VALUES ('000001','000130');
INSERT INTO `sys_role_menu` VALUES ('000001','000131');
INSERT INTO `sys_role_menu` VALUES ('000001','000132');
INSERT INTO `sys_role_menu` VALUES ('000001','000133');
INSERT INTO `sys_role_menu` VALUES ('000001','000134');
INSERT INTO `sys_role_menu` VALUES ('000001','000135');
INSERT INTO `sys_role_menu` VALUES ('000001','000140');
INSERT INTO `sys_role_menu` VALUES ('000001','000141');
INSERT INTO `sys_role_menu` VALUES ('000001','000142');
INSERT INTO `sys_role_menu` VALUES ('000001','000143');
INSERT INTO `sys_role_menu` VALUES ('000001','000144');
INSERT INTO `sys_role_menu` VALUES ('000001','000145');
INSERT INTO `sys_role_menu` VALUES ('000001','000150');
INSERT INTO `sys_role_menu` VALUES ('000001','000151');
INSERT INTO `sys_role_menu` VALUES ('000001','000152');
INSERT INTO `sys_role_menu` VALUES ('000001','000153');
INSERT INTO `sys_role_menu` VALUES ('000001','000154');
INSERT INTO `sys_role_menu` VALUES ('000001','000160');
INSERT INTO `sys_role_menu` VALUES ('000001','000161');
INSERT INTO `sys_role_menu` VALUES ('000001','000162');
INSERT INTO `sys_role_menu` VALUES ('000001','000163');
INSERT INTO `sys_role_menu` VALUES ('000001','000170');
INSERT INTO `sys_role_menu` VALUES ('000001','000171');
INSERT INTO `sys_role_menu` VALUES ('000001','000172');
INSERT INTO `sys_role_menu` VALUES ('000001','000173');
INSERT INTO `sys_role_menu` VALUES ('000001','000174');
INSERT INTO `sys_role_menu` VALUES ('000001','000180');
INSERT INTO `sys_role_menu` VALUES ('000001','000181');
INSERT INTO `sys_role_menu` VALUES ('000001','000182');
INSERT INTO `sys_role_menu` VALUES ('000001','000190');
INSERT INTO `sys_role_menu` VALUES ('000001','000191');
INSERT INTO `sys_role_menu` VALUES ('000001','000192');
INSERT INTO `sys_role_menu` VALUES ('000001','000193');
INSERT INTO `sys_role_menu` VALUES ('000001','000194');
INSERT INTO `sys_role_menu` VALUES ('000001','000195');
INSERT INTO `sys_role_menu` VALUES ('000001','000196');
INSERT INTO `sys_role_menu` VALUES ('000001','000197');
INSERT INTO `sys_role_menu` VALUES ('000001','000198');
INSERT INTO `sys_role_menu` VALUES ('000001','325518182582456320');
INSERT INTO `sys_role_menu` VALUES ('000001','325518338505707520');
INSERT INTO `sys_role_menu` VALUES ('000001','325518440133693440');
INSERT INTO `sys_role_menu` VALUES ('000001','325883052729438208');
INSERT INTO `sys_role_menu` VALUES ('000001','327266832077688832');
INSERT INTO `sys_role_menu` VALUES ('000001','327267036847804416');
INSERT INTO `sys_role_menu` VALUES ('000001','327267207878938624');
INSERT INTO `sys_role_menu` VALUES ('000001','327267345460498432');
INSERT INTO `sys_role_menu` VALUES ('000001','327267400540098560');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_finance_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_inventory_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_order_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_product_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','business_sales_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_center_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_download_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_upload_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_export_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_query_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','production_line_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('100001','000100');
INSERT INTO `sys_role_menu` VALUES ('100001','000120');
INSERT INTO `sys_role_menu` VALUES ('100001','000121');
INSERT INTO `sys_role_menu` VALUES ('100001','000122');
INSERT INTO `sys_role_menu` VALUES ('100001','000123');
INSERT INTO `sys_role_menu` VALUES ('100001','000124');
INSERT INTO `sys_role_menu` VALUES ('100001','000130');
INSERT INTO `sys_role_menu` VALUES ('100001','000131');
INSERT INTO `sys_role_menu` VALUES ('100001','000132');
INSERT INTO `sys_role_menu` VALUES ('100001','000133');
INSERT INTO `sys_role_menu` VALUES ('100001','000134');
INSERT INTO `sys_role_menu` VALUES ('100001','000135');
INSERT INTO `sys_role_menu` VALUES ('100001','000140');
INSERT INTO `sys_role_menu` VALUES ('100001','000141');
INSERT INTO `sys_role_menu` VALUES ('100001','000142');
INSERT INTO `sys_role_menu` VALUES ('100001','000143');
INSERT INTO `sys_role_menu` VALUES ('100001','000144');
INSERT INTO `sys_role_menu` VALUES ('100001','000145');
INSERT INTO `sys_role_menu` VALUES ('100001','000150');
INSERT INTO `sys_role_menu` VALUES ('100001','000151');
INSERT INTO `sys_role_menu` VALUES ('100001','000152');
INSERT INTO `sys_role_menu` VALUES ('100001','000153');
INSERT INTO `sys_role_menu` VALUES ('100001','000154');
INSERT INTO `sys_role_menu` VALUES ('100001','000160');
INSERT INTO `sys_role_menu` VALUES ('100001','000161');
INSERT INTO `sys_role_menu` VALUES ('100001','000162');
INSERT INTO `sys_role_menu` VALUES ('100001','000163');
INSERT INTO `sys_role_menu` VALUES ('100001','000170');
INSERT INTO `sys_role_menu` VALUES ('100001','000171');
INSERT INTO `sys_role_menu` VALUES ('100001','000172');
INSERT INTO `sys_role_menu` VALUES ('100001','000173');
INSERT INTO `sys_role_menu` VALUES ('100001','000174');
INSERT INTO `sys_role_menu` VALUES ('100001','000180');
INSERT INTO `sys_role_menu` VALUES ('100001','000181');
INSERT INTO `sys_role_menu` VALUES ('100001','000182');
INSERT INTO `sys_role_menu` VALUES ('100001','000190');
INSERT INTO `sys_role_menu` VALUES ('100001','000191');
INSERT INTO `sys_role_menu` VALUES ('100001','000192');
INSERT INTO `sys_role_menu` VALUES ('100001','000193');
INSERT INTO `sys_role_menu` VALUES ('100001','000194');
INSERT INTO `sys_role_menu` VALUES ('100001','000195');
INSERT INTO `sys_role_menu` VALUES ('100001','000196');
INSERT INTO `sys_role_menu` VALUES ('100001','000197');
INSERT INTO `sys_role_menu` VALUES ('100001','000198');
INSERT INTO `sys_role_menu` VALUES ('100002','000100');
INSERT INTO `sys_role_menu` VALUES ('100002','000120');
INSERT INTO `sys_role_menu` VALUES ('100002','000121');
INSERT INTO `sys_role_menu` VALUES ('100002','000130');
INSERT INTO `sys_role_menu` VALUES ('100002','000131');
INSERT INTO `sys_role_menu` VALUES ('100002','000160');
INSERT INTO `sys_role_menu` VALUES ('100002','000161');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000100');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000120');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000121');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000130');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000131');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000160');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000161');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000163');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000180');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000181');
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_search_index`
--

DROP TABLE IF EXISTS `sys_search_index`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_search_index` (
  `index_id` varchar(128) NOT NULL COMMENT '索引ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `module_key` varchar(64) NOT NULL COMMENT '模块标识',
  `module_name` varchar(64) NOT NULL COMMENT '模块名称',
  `biz_id` varchar(64) NOT NULL COMMENT '业务主键ID',
  `title` varchar(255) NOT NULL COMMENT '搜索标题',
  `subtitle` varchar(255) DEFAULT NULL COMMENT '搜索副标题',
  `content` text COMMENT '搜索内容',
  `permission` varchar(128) NOT NULL COMMENT '搜索权限标识',
  `route_path` varchar(255) DEFAULT NULL COMMENT '前端跳转路径',
  `owner_id` varchar(32) DEFAULT NULL COMMENT '数据所属用户ID',
  `dept_id` varchar(32) DEFAULT NULL COMMENT '部门ID',
  `created_by` varchar(32) DEFAULT NULL COMMENT '创建人',
  `status` varchar(8) DEFAULT '0' COMMENT '状态：0正常 1停用',
  `deleted` tinyint DEFAULT '0' COMMENT '删除标记：0正常 1删除',
  `source_table` varchar(128) DEFAULT NULL COMMENT '来源业务表',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`index_id`),
  KEY `idx_search_tenant_module` (`tenant_id`,`module_key`),
  KEY `idx_search_tenant_permission` (`tenant_id`,`permission`),
  KEY `idx_search_tenant_status_deleted` (`tenant_id`,`status`,`deleted`),
  KEY `idx_search_owner` (`tenant_id`,`owner_id`),
  KEY `idx_search_created_by` (`tenant_id`,`created_by`),
  KEY `idx_search_dept` (`tenant_id`,`dept_id`),
  KEY `idx_search_biz` (`tenant_id`,`module_key`,`biz_id`),
  KEY `idx_search_title` (`tenant_id`,`title`),
  KEY `idx_search_subtitle` (`tenant_id`,`subtitle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='统一搜索索引表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_search_index`
--

LOCK TABLES `sys_search_index` WRITE;
/*!40000 ALTER TABLE `sys_search_index` DISABLE KEYS */;
INSERT INTO `sys_search_index` VALUES ('000000:menu:000100','000000','menu','菜单管理','000100','系统管理',NULL,'系统管理,/system','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 08:05:37','2026-06-17 08:05:37');
INSERT INTO `sys_search_index` VALUES ('000000:menu:000110','000000','menu','菜单管理','000110','租户管理',NULL,'租户管理,/tenant','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 08:05:50','2026-06-17 08:05:50');
INSERT INTO `sys_search_index` VALUES ('000000:menu:325518182582456320','000000','menu','菜单管理','325518182582456320','全局搜索','system:user:search','全局搜索,system:user:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 06:13:03','2026-06-17 06:13:03');
INSERT INTO `sys_search_index` VALUES ('000000:menu:325518338505707520','000000','menu','菜单管理','325518338505707520','全局搜索','system:role:search','全局搜索,system:role:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 06:13:40','2026-06-17 06:13:40');
INSERT INTO `sys_search_index` VALUES ('000000:menu:325518440133693440','000000','menu','菜单管理','325518440133693440','全局搜索','system:menu:search','全局搜索,system:menu:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 06:14:04','2026-06-17 06:14:04');
INSERT INTO `sys_search_index` VALUES ('000000:menu:325883052729438208','000000','menu','菜单管理','325883052729438208','页面配置','system:pageconfig:list','页面配置,/system/page-config,system/page-config,system:pageconfig:list','system:menu:search','/system/menu',NULL,NULL,NULL,'1',0,'sys_menu','2026-06-22 06:58:54','2026-06-22 06:58:54');
INSERT INTO `sys_search_index` VALUES ('000000:menu:327266832077688832','000000','menu','菜单管理','327266832077688832','全局搜索','system:dept:search','全局搜索,system:dept:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-22 02:01:34','2026-06-22 02:01:34');
INSERT INTO `sys_search_index` VALUES ('000000:menu:327267036847804416','000000','menu','菜单管理','327267036847804416','全局搜索','system:config:search','全局搜索,system:config:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-22 02:02:23','2026-06-22 02:02:23');
INSERT INTO `sys_search_index` VALUES ('000000:menu:327267207878938624','000000','menu','菜单管理','327267207878938624','全局搜索','system:dict:search','全局搜索,system:dict:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-22 02:03:04','2026-06-22 02:03:04');
INSERT INTO `sys_search_index` VALUES ('000000:menu:327267345460498432','000000','menu','菜单管理','327267345460498432','全局搜索','system:log:search','全局搜索,system:log:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-22 02:03:37','2026-06-22 02:03:37');
INSERT INTO `sys_search_index` VALUES ('000000:menu:327267400540098560','000000','menu','菜单管理','327267400540098560','全局搜索','system:log:search','全局搜索,system:log:search','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-22 02:03:50','2026-06-22 02:03:50');
INSERT INTO `sys_search_index` VALUES ('000000:menu:business_inventory_0001','000000','menu','菜单管理','business_inventory_0001','库存管理','business:inventory:list','库存管理,/business/inventory,business/inventory,business:inventory:list','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 08:03:38','2026-06-17 08:03:38');
INSERT INTO `sys_search_index` VALUES ('000000:menu:business_order_0001','000000','menu','菜单管理','business_order_0001','订单管理','business:order:list','订单管理,/business/order,business/order,business:order:list','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 07:59:29','2026-06-17 07:59:29');
INSERT INTO `sys_search_index` VALUES ('000000:menu:business_sales_0001','000000','menu','菜单管理','business_sales_0001','销售管理','business:sales:list','销售管理,/business/sales,business/sales,business:sales:list','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 08:03:15','2026-06-17 08:03:15');
INSERT INTO `sys_search_index` VALUES ('000000:menu:production_line_0001','000000','menu','菜单管理','production_line_0001','生产管理','business:production-line:list','生产管理,/business/production-line,business/production-line,business:production-line:list','system:menu:search','/system/menu',NULL,NULL,NULL,'0',0,'sys_menu','2026-06-17 07:55:51','2026-06-17 07:55:51');
INSERT INTO `sys_search_index` VALUES ('000000:user:327268172644356096','000000','user','用户管理','327268172644356096','globalSearch','测试全局搜索','globalSearch,测试全局搜索,暴龙神,18569795075,18569795075@163.com','system:user:search','/system/user',NULL,'325536911462633472',NULL,'0',0,'sys_user','2026-06-22 02:06:54','2026-06-22 02:06:54');
/*!40000 ALTER TABLE `sys_search_index` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_storage_config`
--

DROP TABLE IF EXISTS `sys_storage_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_storage_config` (
  `storage_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储配置ID',
  `tenant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '000000' COMMENT '租户ID，000000表示平台默认配置',
  `storage_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储名称',
  `storage_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储类型：minio/aliyun_oss/tencent_cos/qiniu_kodo/huawei_obs/aws_s3/local',
  `endpoint` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '访问端点，不带协议，例如 s3.minion.xlcig.cn / oss-cn-hangzhou.aliyuncs.com',
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地域，例如 oss-cn-hangzhou / ap-shanghai',
  `port` int DEFAULT NULL COMMENT '端口，MinIO常用443/9000',
  `use_ssl` tinyint NOT NULL DEFAULT '1' COMMENT '是否使用HTTPS',
  `access_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AccessKey，可加密',
  `secret_key` text COLLATE utf8mb4_unicode_ci COMMENT 'SecretKey，必须加密',
  `public_bucket` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共桶',
  `private_bucket` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '私有桶',
  `public_base_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共访问基础URL',
  `private_base_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '私有访问基础URL，一般可为空',
  `path_style` tinyint NOT NULL DEFAULT '0' COMMENT '是否Path Style访问，MinIO通常为1，云厂商通常为0',
  `config_json` json DEFAULT NULL COMMENT '厂商差异配置JSON',
  `policy_json` json DEFAULT NULL COMMENT '上传限制/访问策略JSON',
  `is_default` tinyint NOT NULL DEFAULT '0' COMMENT '是否默认配置',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1启用，0停用',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`storage_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_storage_type` (`storage_type`),
  KEY `idx_status` (`status`),
  KEY `idx_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对象存储配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_storage_config`
--

LOCK TABLES `sys_storage_config` WRITE;
/*!40000 ALTER TABLE `sys_storage_config` DISABLE KEYS */;
INSERT INTO `sys_storage_config` VALUES ('000001','000000','MinIO分布式存储','minio','s3.minion.xlcig.cn',NULL,443,1,'admin','StrongPass123!','public-assets','private-assets','https://s3.minion.xlcig.cn/public-assets',NULL,1,'{\"nodes\": [{\"name\": \"minio1\", \"apiPort\": 9000, \"consolePort\": 9001}, {\"name\": \"minio2\", \"apiPort\": 9002, \"consolePort\": 9003}, {\"name\": \"minio3\", \"apiPort\": 9004, \"consolePort\": 9005}, {\"name\": \"minio4\", \"apiPort\": 9006, \"consolePort\": 9007}], \"apiUrl\": \"https://s3.minion.xlcig.cn\", \"consoleUrl\": \"https://minion.xlcig.cn\", \"clusterMode\": true, \"forcePathStyle\": true}','{\"maxSizeMB\": 100, \"allowedExt\": [\"jpg\", \"jpeg\", \"png\", \"gif\", \"webp\", \"pdf\", \"doc\", \"docx\", \"xls\", \"xlsx\", \"ppt\", \"pptx\", \"zip\"], \"blockedExt\": [\"exe\", \"bat\", \"cmd\", \"sh\", \"js\", \"msi\"], \"privateExpireSeconds\": 300}',1,0,'MinIO Docker 四节点分布式集群；控制台域名 minion.xlcig.cn；S3 API 域名 s3.minion.xlcig.cn',NULL,'2026-06-15 08:21:40',NULL,'2026-06-16 02:01:53',0);
/*!40000 ALTER TABLE `sys_storage_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_tenant`
--

DROP TABLE IF EXISTS `sys_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant` (
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID，000000为平台租户，其他租户使用雪花ID字符串',
  `tenant_name` varchar(100) NOT NULL COMMENT '租户名称',
  `package_id` varchar(32) DEFAULT NULL COMMENT '绑定套餐ID',
  `expire_time` datetime DEFAULT NULL COMMENT '套餐到期时间，000000平台租户可为空表示永久有效',
  `domain_name` varchar(100) DEFAULT NULL COMMENT '绑定域名，如：admin.xxx.com',
  `contact_user` varchar(50) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(30) DEFAULT NULL COMMENT '联系电话',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `uk_tenant_domain` (`domain_name`),
  KEY `idx_tenant_package` (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_tenant`
--

LOCK TABLES `sys_tenant` WRITE;
/*!40000 ALTER TABLE `sys_tenant` DISABLE KEYS */;
INSERT INTO `sys_tenant` VALUES ('000000','平台租户','P001',NULL,'admin.xxx.com','系统管理员','00000000000','0','平台默认租户，永久有效','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_tenant` VALUES ('100000','默认租户','P100','2027-06-24 00:58:56','test.xxx.com','租户管理员','13800000000','0','开箱即用默认租户，标准版套餐','2026-06-11 00:58:56','2026-06-11 02:25:58');
/*!40000 ALTER TABLE `sys_tenant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_theme_config`
--

DROP TABLE IF EXISTS `sys_theme_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_theme_config` (
  `theme_id` varchar(32) NOT NULL COMMENT '主题配置ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `nav_theme` varchar(20) NOT NULL DEFAULT 'light' COMMENT '导航主题',
  `color_primary` varchar(20) NOT NULL DEFAULT '#1677ff' COMMENT '主色',
  `layout` varchar(20) NOT NULL DEFAULT 'mix' COMMENT '布局',
  `content_width` varchar(20) NOT NULL DEFAULT 'Fluid' COMMENT '内容宽度',
  `fixed_header` tinyint NOT NULL DEFAULT '0' COMMENT '固定头部',
  `fix_siderbar` tinyint NOT NULL DEFAULT '1' COMMENT '固定侧栏',
  `color_weak` tinyint NOT NULL DEFAULT '0' COMMENT '色弱模式',
  `title` varchar(100) NOT NULL DEFAULT 'BLS Admin' COMMENT '标题',
  `logo` varchar(500) DEFAULT NULL COMMENT 'Logo',
  `iconfont_url` varchar(500) DEFAULT NULL COMMENT 'iconfont地址',
  `token_json` text COMMENT '主题Token(JSON字符串)',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`theme_id`),
  UNIQUE KEY `uk_theme_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统主题配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_theme_config`
--

LOCK TABLES `sys_theme_config` WRITE;
/*!40000 ALTER TABLE `sys_theme_config` DISABLE KEYS */;
INSERT INTO `sys_theme_config` VALUES ('000501','000000','light','#722ED1','mix','Fluid',0,1,0,'BLS Management System','https://xux.xlcig.cn/logo.png','','{}','0',NULL,0,'2026-06-11 00:58:56','2026-06-22 02:36:12');
INSERT INTO `sys_theme_config` VALUES ('100501','100000','light','#1677ff','mix','Fluid',0,1,0,'默认租户工作台',NULL,'','{}','0',NULL,0,'2026-06-11 00:58:56','2026-06-12 07:23:45');
/*!40000 ALTER TABLE `sys_theme_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_ui_field`
--

DROP TABLE IF EXISTS `sys_ui_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_ui_field` (
  `field_id` varchar(32) NOT NULL COMMENT '字段ID',
  `page_code` varchar(100) NOT NULL COMMENT '页面编码，如 system_dept',
  `field_key` varchar(100) NOT NULL COMMENT '字段名，如 deptName',
  `field_label` varchar(100) NOT NULL COMMENT '字段标题，如 部门名称',
  `field_scope` char(1) NOT NULL DEFAULT '2' COMMENT '字段范围：0表格 1表单 2两者都用',
  `field_type` varchar(50) NOT NULL DEFAULT 'text' COMMENT '字段类型：text/select/digit/textarea/dateTime/treeSelect',
  `value_enum_key` varchar(100) DEFAULT NULL COMMENT '字典类型，如 sys_status',
  `is_search` tinyint NOT NULL DEFAULT '1' COMMENT '是否参与搜索：1是 0否',
  `is_required` tinyint NOT NULL DEFAULT '0' COMMENT '是否必填：1是 0否',
  `is_copyable` tinyint NOT NULL DEFAULT '0' COMMENT '是否可复制：1是 0否',
  `is_ellipsis` tinyint NOT NULL DEFAULT '0' COMMENT '是否省略显示：1是 0否',
  `is_form_visible` tinyint NOT NULL DEFAULT '1' COMMENT '表单是否显示：1是 0否',
  `is_table_visible` tinyint NOT NULL DEFAULT '1' COMMENT '表格是否显示：1是 0否',
  `width` int DEFAULT NULL COMMENT '表格列宽',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `default_value` varchar(200) DEFAULT NULL COMMENT '默认值',
  `placeholder` varchar(200) DEFAULT NULL COMMENT '占位提示',
  `props_json` json DEFAULT NULL COMMENT '额外属性JSON，如 treeSelect / multiple 等',
  `render_code` varchar(100) DEFAULT NULL COMMENT '特殊渲染标记，如 iconPicker/statusTag',
  `before_submit_code` varchar(100) DEFAULT NULL COMMENT '提交前处理标记，如 joinComma/splitArray',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0启用 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`field_id`),
  KEY `idx_field_page_code` (`page_code`),
  KEY `idx_field_sort` (`page_code`,`sort_num`),
  KEY `idx_field_key` (`page_code`,`field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='动态字段元数据表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_ui_field`
--

LOCK TABLES `sys_ui_field` WRITE;
/*!40000 ALTER TABLE `sys_ui_field` DISABLE KEYS */;
INSERT INTO `sys_ui_field` VALUES ('100001','system_dept','deptName','部门名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入部门名称',NULL,NULL,NULL,'0','部门名称','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100002','system_dept','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,2,'0',NULL,NULL,NULL,NULL,'0','排序','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100003','system_dept','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,3,'0',NULL,NULL,'statusTag',NULL,'0','状态','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100004','system_dept','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,NULL,4,NULL,NULL,NULL,NULL,NULL,'0','创建时间','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100005','system_dept','parentId','上级部门','1','treeSelect',NULL,0,1,0,0,1,0,NULL,5,'000000','请选择上级部门','{\"allowClear\": false, \"showSearch\": true, \"treeNodeFilterProp\": \"title\", \"treeDefaultExpandAll\": true}',NULL,NULL,'0','上级部门','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('200001','system_role','roleName','角色名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入角色名称',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200002','system_role','roleKey','角色标识','2','text',NULL,1,1,1,1,1,1,NULL,2,NULL,'请输入角色标识',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200003','system_role','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,3,'0',NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200004','system_role','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,4,'0',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200005','system_role','remark','备注','2','textarea',NULL,0,0,0,0,1,1,NULL,5,NULL,NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200006','system_role','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,NULL,6,NULL,NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('300001','system_menu','menuName','菜单名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入菜单名称',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300002','system_menu','icon','图标','0','text',NULL,0,0,0,0,0,1,80,2,NULL,NULL,NULL,'iconPicker',NULL,'0','仅表格显示图标','2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300003','system_menu','path','路由地址','0','text',NULL,1,0,1,1,0,1,NULL,3,NULL,'请输入路由地址',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300004','system_menu','component','组件路径','0','text',NULL,0,0,0,1,1,1,NULL,4,NULL,'请输入组件路径',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300005','system_menu','perms','权限标识','0','text',NULL,0,0,1,1,1,1,NULL,5,NULL,'请输入权限标识',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300006','system_menu','menuType','类型','2','select','sys_menu_type',1,1,0,0,1,1,NULL,6,'1',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300007','system_menu','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,7,'0',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300008','system_menu','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,8,'0',NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300009','system_menu','parentId','上级菜单','1','treeSelect',NULL,0,1,0,0,1,0,NULL,9,'000000','请选择上级菜单','{\"allowClear\": true, \"treeDefaultExpandAll\": true}',NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('userf001','system_user','username','用户名','2','text',NULL,1,1,1,1,1,1,NULL,1,NULL,'请输入用户名',NULL,NULL,NULL,'0','用户名','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf002','system_user','nickname','昵称','2','text',NULL,0,1,0,0,1,1,NULL,2,NULL,'请输入昵称',NULL,NULL,NULL,'0','昵称','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf003','system_user','realName','真实姓名','2','text',NULL,0,0,0,0,1,1,NULL,3,NULL,'请输入真实姓名',NULL,NULL,NULL,'0','真实姓名','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf004','system_user','phone','手机号','2','text',NULL,0,0,0,0,1,1,NULL,4,NULL,'请输入手机号',NULL,NULL,NULL,'0','手机号','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf005','system_user','email','邮箱','2','text',NULL,0,0,0,1,1,1,NULL,5,NULL,'请输入邮箱',NULL,NULL,NULL,'0','邮箱','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf006','system_user','isAdmin','管理员','2','select','sys_yes_no',0,1,0,0,1,1,100,6,'0',NULL,NULL,'statusTag',NULL,'0','是否管理员','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf007','system_user','status','状态','2','select','sys_status',1,1,0,0,1,1,100,7,'0',NULL,NULL,'statusTag',NULL,'0','状态','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf008','system_user','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,160,8,NULL,NULL,NULL,NULL,NULL,'0','创建时间','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf009','system_user','password','密码','1','password',NULL,0,1,0,0,1,0,NULL,9,NULL,'新增时为空则使用默认密码 123456，编辑时留空不修改',NULL,NULL,NULL,'0','密码','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf010','system_user','deptId','部门','1','treeSelect',NULL,0,0,0,0,1,0,NULL,10,'000000','请选择部门','{\"allowClear\": true, \"showSearch\": true, \"treeNodeFilterProp\": \"title\", \"treeDefaultExpandAll\": true}',NULL,NULL,'0','部门','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf011','system_user','roleIds','角色','1','select',NULL,0,0,0,0,1,0,NULL,11,NULL,'请选择角色','{\"mode\": \"multiple\", \"placeholder\": \"请选择角色\"}',NULL,'joinComma','0','角色','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf012','system_user','remark','备注','2','textarea',NULL,0,0,0,0,1,1,NULL,12,NULL,'请输入备注',NULL,NULL,NULL,'0','备注','2026-06-12 08:48:53','2026-06-12 08:48:53');
/*!40000 ALTER TABLE `sys_ui_field` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_upload_audit`
--

DROP TABLE IF EXISTS `sys_upload_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_upload_audit` (
  `audit_id` varchar(32) NOT NULL COMMENT '审计ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `access_type` char(10) NOT NULL COMMENT '访问类型：public/private',
  `storage_id` varchar(32) DEFAULT NULL COMMENT '存储配置ID',
  `storage_type` varchar(30) DEFAULT NULL COMMENT '存储类型：minio/aliyun_oss/aws_s3/local等',
  `bucket_name` varchar(100) DEFAULT NULL COMMENT '存储桶名称',
  `object_name` varchar(500) DEFAULT NULL COMMENT '对象名',
  `original_name` varchar(255) NOT NULL COMMENT '原始文件名',
  `safe_name` varchar(255) NOT NULL COMMENT '清洗后文件名',
  `file_ext` varchar(20) DEFAULT NULL COMMENT '文件后缀',
  `mime_type` varchar(100) DEFAULT NULL COMMENT 'MIME类型',
  `file_size` bigint NOT NULL COMMENT '文件大小(字节)',
  `max_upload_bytes` bigint DEFAULT NULL COMMENT '上传限制(字节)',
  `upload_status` char(1) NOT NULL DEFAULT '1' COMMENT '上传状态：1成功 0失败',
  `fail_reason` varchar(1000) DEFAULT NULL COMMENT '失败原因',
  `client_ip` varchar(45) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `file_id` varchar(32) DEFAULT NULL COMMENT '文件ID',
  `file_url` varchar(1000) DEFAULT NULL COMMENT '文件URL',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`audit_id`),
  KEY `idx_upload_audit_tenant_time` (`tenant_id`,`create_time`),
  KEY `idx_upload_audit_user_time` (`user_id`,`create_time`),
  KEY `idx_upload_audit_status` (`upload_status`),
  KEY `idx_upload_audit_storage` (`storage_id`),
  KEY `idx_upload_audit_request_id` (`request_id`),
  KEY `idx_upload_audit_file_id` (`file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件上传审计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_upload_audit`
--

LOCK TABLES `sys_upload_audit` WRITE;
/*!40000 ALTER TABLE `sys_upload_audit` DISABLE KEYS */;
INSERT INTO `sys_upload_audit` VALUES ('325441925152903168','000000',NULL,NULL,'头像','private','000001','minio','private-assets','头像/1781658600976_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','.png','image/png',190,20971520,'1',NULL,NULL,NULL,NULL,'325441924779610112',NULL,'2026-06-17 01:10:01');
INSERT INTO `sys_upload_audit` VALUES ('325442039732899840','000000',NULL,NULL,'头像','public','000001','minio','public-assets','头像/1781658628415_sanjiao@2x.png','sanjiao@2x.png','sanjiao@2x.png','.png','image/png',454,20971520,'1',NULL,NULL,NULL,NULL,'325442039544156160','https://s3.minion.xlcig.cn/public-assets/头像/1781658628415_sanjiao@2x.png','2026-06-17 01:10:29');
INSERT INTO `sys_upload_audit` VALUES ('325452100395995136','000000',NULL,NULL,'头像','public','000001','minio','public-assets','头像/1781661026961_jian@2x.png','jian@2x.png','jian@2x.png','.png','image/png',702,20971520,'1',NULL,NULL,NULL,NULL,'325452100014313472','https://s3.minion.xlcig.cn/public-assets/头像/1781661026961_jian@2x.png','2026-06-17 01:50:27');
INSERT INTO `sys_upload_audit` VALUES ('325456137048690688','000000',NULL,NULL,'avatar','public','000001','minio','public-assets','avatar/1781661989382_images.jpg','images.jpg','images.jpg','.jpg','image/jpeg',5354,20971520,'1',NULL,NULL,NULL,NULL,'325456136671203328','https://s3.minion.xlcig.cn/public-assets/avatar/1781661989382_images.jpg','2026-06-17 02:06:30');
INSERT INTO `sys_upload_audit` VALUES ('325456180069666816','000000',NULL,NULL,'avatar','public','000001','minio','public-assets','avatar/1781661999673_images.jpg','images.jpg','images.jpg','.jpg','image/jpeg',5354,20971520,'1',NULL,NULL,NULL,NULL,'325456179692179456','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg','2026-06-17 02:06:40');
/*!40000 ALTER TABLE `sys_upload_audit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'MD5密码',
  `nickname` varchar(50) NOT NULL COMMENT '用户昵称',
  `real_name` varchar(50) DEFAULT NULL COMMENT '真实姓名',
  `avatar` varchar(500) DEFAULT NULL COMMENT '头像地址',
  `gender` char(1) NOT NULL DEFAULT '2' COMMENT '性别：0男 1女 2未知',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(30) DEFAULT NULL COMMENT '手机号',
  `dept_id` varchar(32) DEFAULT NULL COMMENT '部门ID',
  `is_admin` char(1) NOT NULL DEFAULT '0' COMMENT '是否管理员：0否 1是',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '状态：0正常 1停用',
  `last_login_ip` varchar(45) DEFAULT NULL COMMENT '最后登录IP',
  `last_login_time` datetime DEFAULT NULL COMMENT '最后登录时间',
  `password_update_time` datetime DEFAULT NULL COMMENT '密码更新时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0未删除 1已删除',
  `create_by` varchar(32) DEFAULT NULL COMMENT '创建人ID',
  `update_by` varchar(32) DEFAULT NULL COMMENT '更新人ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_tenant_username` (`tenant_id`,`username`),
  KEY `idx_user_tenant` (`tenant_id`),
  KEY `idx_user_phone` (`phone`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_dept` (`dept_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES ('000001','000000','superadmin','e10adc3949ba59abbe56e057f20f883e','超级管理员','暴龙神','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg','0','18569795073@163.com','15866669999','000001','1','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 00:58:56','2026-06-17 02:07:05');
INSERT INTO `sys_user` VALUES ('100001','100000','admin','e10adc3949ba59abbe56e057f20f883e','租户管理员','租户管理员',NULL,'2',NULL,NULL,'100001','1','0',NULL,NULL,NULL,'默认租户管理员',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 03:12:44');
INSERT INTO `sys_user` VALUES ('100002','100000','user','e10adc3949ba59abbe56e057f20f883e','普通用户',NULL,NULL,'2',NULL,NULL,NULL,'0','0',NULL,NULL,NULL,'默认租户普通用户',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 07:47:37');
INSERT INTO `sys_user` VALUES ('323300735171301376','000000','usera','e10adc3949ba59abbe56e057f20f883e','用户A',NULL,NULL,'2',NULL,NULL,'323381860459745280','0','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 03:21:41','2026-06-12 08:19:50');
INSERT INTO `sys_user` VALUES ('323367925727760384','100000','user2','e10adc3949ba59abbe56e057f20f883e','用户2',NULL,NULL,'2',NULL,NULL,NULL,'1','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 07:48:41','2026-06-11 07:48:41');
INSERT INTO `sys_user` VALUES ('323736538880020480','000000','testUser2','e10adc3949ba59abbe56e057f20f883e','c测试用户',NULL,NULL,'2',NULL,NULL,'323719748447768576','1','0',NULL,NULL,NULL,'test',0,NULL,NULL,'2026-06-12 08:13:26','2026-06-12 08:16:31');
INSERT INTO `sys_user` VALUES ('327268172644356096','000000','globalSearch','e10adc3949ba59abbe56e057f20f883e','测试全局搜索','暴龙神',NULL,'0','18569795075@163.com','18569795075','325536911462633472','0','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-22 02:06:54','2026-06-22 02:06:54');
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`,`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES ('000001','000001');
INSERT INTO `sys_user_role` VALUES ('000001','323304627162451968');
INSERT INTO `sys_user_role` VALUES ('000001','323642966914764800');
INSERT INTO `sys_user_role` VALUES ('100001','100001');
INSERT INTO `sys_user_role` VALUES ('323300735171301376','323642966914764800');
INSERT INTO `sys_user_role` VALUES ('327268172644356096','323642966914764800');
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-22  7:37:51

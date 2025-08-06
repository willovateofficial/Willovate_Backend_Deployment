import express, { Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  authenticateBusinessOwnerJWT,
  BusinessOwnerRequest,
} from "../middleware/authenticateJWT";

const router = express.Router();
const prisma = new PrismaClient();

// Create Bill
router.post(
  "/bill",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const { orderId, taxRates } = req.body;
      const businessId = req.businessOwner?.businessId;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.businessId !== businessId) {
        res
          .status(403)
          .json({ error: "Unauthorized to create bill for this order" });
        return;
      }

      const bill = await prisma.bill.create({
        data: {
          order: { connect: { id: orderId } },
          business: { connect: { id: businessId } },
          vatLow: taxRates.vatLow,
          vatHigh: taxRates.vatHigh,
          serviceTax: taxRates.serviceTax,
          serviceCharge: taxRates.serviceCharge,
        },
      });

      res.status(201).json(bill);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Get Bill by orderId
router.get(
  "/bill/:orderId",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const orderId = Number(req.params.orderId);
      const businessId = req.businessOwner?.businessId;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.businessId !== businessId) {
        res.status(403).json({ error: "Unauthorized access" });
        return;
      }

      const bill = await prisma.bill.findUnique({ where: { orderId } });
      res.status(200).json(bill);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update charges
router.put(
  "/bill/:orderId/update-charges",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const orderId = Number(req.params.orderId);
      const businessId = req.businessOwner?.businessId;
      const { vatLow, vatHigh, serviceTax, serviceCharge } = req.body;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.businessId !== businessId) {
        res.status(403).json({ error: "Unauthorized to update charges" });
        return;
      }

      const updated = await prisma.bill.update({
        where: { orderId },
        data: { vatLow, vatHigh, serviceTax, serviceCharge },
      });

      res.status(200).json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update order status
router.put(
  "/orders/:orderId/status",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const orderId = Number(req.params.orderId);
      const { status } = req.body;
      const businessId = req.businessOwner?.businessId;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.businessId !== businessId) {
        res.status(403).json({ error: "Unauthorized to update this order" });
        return;
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { status },
      });

      res.status(200).json(updatedOrder);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get all orders for current business
router.get(
  "/orders",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const businessId = req.businessOwner?.businessId;

      const orders = await prisma.order.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        include: { items: true, bill: true },
      });

      res.status(200).json(orders);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Update billStoreLink for a specific bill
router.put(
  "/bill/:orderId/store-link",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const { billStoreLink, cloudinaryPublicId } = req.body;
      const { orderId } = req.params;
      const businessId = req.businessOwner?.businessId;

      const numericOrderId = Number(orderId);
      if (isNaN(numericOrderId)) {
        res.status(400).json({ error: "Invalid order ID" });
        return;
      }

      const order = await prisma.order.findUnique({
        where: { id: numericOrderId },
      });

      if (!order || order.businessId !== businessId) {
        res.status(403).json({ error: "Unauthorized or order not found" });
        return;
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const existingBill = await prisma.bill.findUnique({
        where: { orderId: numericOrderId },
      });

      if (existingBill) {
        await prisma.bill.update({
          where: { orderId: numericOrderId },
          data: {
            billStoreLink,
            billStorePublicId: cloudinaryPublicId,
            expiresAt,
          },
        });
        res.status(200).json({ message: "Bill store link updated successfully" });
      } else {
        await prisma.bill.create({
          data: {
            order: { connect: { id: numericOrderId } },
            business: { connect: { id: businessId } },
            billStoreLink,
            billStorePublicId: cloudinaryPublicId,
            expiresAt,
          },
        });
        res.status(201).json({ message: "Bill created with store link" });
      }
    } catch (error) {
      console.error("Error updating/creating bill store link:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// Get bill store link by orderId
router.get(
  "/bill/:orderId/link",
  authenticateBusinessOwnerJWT,
  async (req: BusinessOwnerRequest, res: Response): Promise<void> => {
    try {
      const orderId = Number(req.params.orderId);
      const businessId = req.businessOwner?.businessId;

      if (isNaN(orderId)) {
        res.status(400).json({ error: "Invalid order ID" });
        return;
      }

      const bill = await prisma.bill.findUnique({
        where: { orderId },
        select: { billStoreLink: true, order: { select: { businessId: true } } },
      });

      if (!bill || bill.order.businessId !== businessId) {
        res.status(403).json({ error: "Unauthorized or bill not found" });
        return;
      }

      res.status(200).json({ billStoreLink: bill.billStoreLink });
    } catch (error: any) {
      console.error("Error retrieving bill link:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

export default router;

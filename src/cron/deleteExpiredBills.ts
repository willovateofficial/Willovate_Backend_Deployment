import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

// Delete image from Cloudinary
const deleteFromCloudinary = async (publicId: string) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const crypto = await import("crypto");
  const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");

  const formData = new URLSearchParams();
  formData.append("public_id", publicId);
  formData.append("api_key", apiKey!);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);

  try {
    await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, formData);
    console.log(`✅ Deleted Cloudinary image: ${publicId}`);
  } catch (error) {
    console.error(`❌ Failed to delete image: ${publicId}`, error);
  }
};

// Schedule the job to run every hour
cron.schedule("0 * * * *", async () => {

  const now = new Date();
  try {
    const expiredBills = await prisma.bill.findMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });

    for (const bill of expiredBills) {
      if (bill.billStorePublicId) {
        await deleteFromCloudinary(bill.billStorePublicId);
      }

      await prisma.bill.delete({
        where: {
          id: bill.id,
        },
      });

      console.log(`🗑️ Deleted bill ID: ${bill.id}`);
    }
  } catch (err) {
    console.error("❌ Error in cron job:", err);
  }
});

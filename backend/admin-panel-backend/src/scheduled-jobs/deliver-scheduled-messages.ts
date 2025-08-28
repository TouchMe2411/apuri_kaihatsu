import DB from "../utils/db-client";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Delivers scheduled messages that are due for delivery
 * This function should be run as a cron job (e.g. every minute)
 */
export default async function deliverScheduledMessages() {
  try {
    // Получаем сообщения, которые нужно доставить (сравнение через DATE_FORMAT для точности до минут)
    const scheduledMessages = await DB.query(
      `SELECT id, title, delivery_at, is_processed FROM Post 
   WHERE delivery_at IS NOT NULL 
     AND DATE_FORMAT(delivery_at, '%Y-%m-%d %H:%i') <= DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 5 HOUR), '%Y-%m-%d %H:%i')
     AND is_processed = 0`
    );

    console.log(`[Scheduled Job] Server time: ${new Date().toISOString()}`);
    console.log(
      `[Scheduled Job] Tashkent time: ${new Date(
        Date.now() + 5 * 60 * 60 * 1000
      ).toISOString()}`
    );
    console.log(
      `[Scheduled Job] Checking messages with delivery_at <= ${new Date(
        Date.now() + 5 * 60 * 60 * 1000
      ).toISOString()}`
    );

    console.log(
      `[Scheduled Job] Found ${scheduledMessages.length} messages to deliver`
    );

    for (const message of scheduledMessages) {
      console.log(
        `[Scheduled Job] Original delivery time: ${message.delivery_at}`
      );

      await DB.execute(
        `
        UPDATE Post 
        SET delivery_at = NULL,
            delivered_at = NOW(),
            is_processed = 1
        WHERE id = :id
        `,
        { id: message.id }
      );

      console.log(
        `[Scheduled Job] Message ${message.id} delivered successfully`
      );
    }

    console.log(
      "[Scheduled Job] All scheduled messages processed successfully"
    );
  } catch (error) {
    console.error(
      "[Scheduled Job] Error delivering scheduled messages:",
      error
    );
    throw error;
  }
}

import * as cron from 'node-cron';
import deliverScheduledMessages from './deliver-scheduled-messages';

/**
 * Initialize all scheduled jobs
 */
export function initScheduledJobs() {
  // Run the scheduled message delivery task every minute
  cron.schedule('* * * * *', async () => {
    try {
      await deliverScheduledMessages();
    } catch (error) {
      console.error('[Scheduled Jobs] Error running scheduled message delivery:', error);
    }
  });

  console.log('[Scheduled Jobs] All scheduled jobs have been initialized');
} 
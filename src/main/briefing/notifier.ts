import type { BriefingStore } from './store.ts';

export type NotificationSender = (title: string, body: string, onClick?: () => void) => void;

export class BriefingNotifier {
  private store: BriefingStore;
  private sender?: NotificationSender;
  private intervalTimer: NodeJS.Timeout | null = null;
  private onTriggerCallback?: () => Promise<void>;

  constructor(store: BriefingStore, sender?: NotificationSender) {
    this.store = store;
    this.sender = sender;
  }

  public setSender(sender: NotificationSender): void {
    this.sender = sender;
  }

  public setOnTrigger(callback: () => Promise<void>): void {
    this.onTriggerCallback = callback;
  }

  public start(): void {
    this.stop();
    // Run an initial check after 5 seconds, then every 60 seconds
    const initialTimer = setTimeout(() => {
      this.checkAndNotify().catch(() => {});
    }, 5000);
    if (initialTimer.unref) initialTimer.unref();

    this.intervalTimer = setInterval(() => {
      this.checkAndNotify().catch(() => {});
    }, 60000);

    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public async checkAndNotify(): Promise<boolean> {
    const settings = await this.store.getSettings();
    if (!settings.enabled || !settings.notificationsEnabled) {
      return false;
    }

    const now = new Date();
    const todayDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    // Avoid duplicate notification if already sent today
    if (settings.lastNotifiedDate === todayDate) {
      return false;
    }

    // Check time matching
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;

    const preferred = settings.preferredTime || '09:00';
    // Trigger if current time is at or past preferred time on this calendar day
    if (currentTimeStr >= preferred) {
      // Mark as notified today before triggering to avoid race conditions
      await this.store.updateSettings({ lastNotifiedDate: todayDate });

      if (this.onTriggerCallback) {
        await this.onTriggerCallback().catch(err => {
          console.warn('Failed to run onTrigger callback for briefing notification:', err);
        });
      }

      if (this.sender) {
        // Privacy protection: Generic title and body, never expose document snippets or clipboard on lock screen
        this.sender(
          'RecallDesk Daily Memory Briefing',
          'Your daily project briefing is ready. Open RecallDesk to review tasks, deadlines, and activity.',
          () => {
            // Optional click handler
          }
        );
      }
      return true;
    }

    return false;
  }
}

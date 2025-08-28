import cron from 'node-cron';
import DB from '../utils/db-client';

console.log('[Scheduled Job] Initializing scheduled posts job');

// Проверка каждую минуту
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        console.log('[Scheduled Job] Checking for posts to send at:', now.toISOString());
        
        // Проверка текущего времени сервера и базы данных
        const dbTimeResult = await DB.query('SELECT NOW() as db_time');
        const dbTime = dbTimeResult[0]?.db_time;
        console.log('[Scheduled Job] Server time:', now);
        console.log('[Scheduled Job] Database time:', dbTime);
        
        // Получаем ВСЕ запланированные сообщения для диагностики
        const allScheduled = await DB.query(
            `SELECT id, title, delivery_at, is_processed FROM Post WHERE delivery_at IS NOT NULL`
        );
        
        interface ScheduledPost {
            id: number;
            title: string;
            delivery_at: Date;
            is_processed: number;
        }

        // Для диагностики выводим все запланированные сообщения
        console.log('[Scheduled Job] All scheduled posts:', 
            allScheduled.map((p: ScheduledPost) => ({
                id: p.id,
                title: p.title,
                delivery_at: new Date(p.delivery_at).toISOString(),
                db_delivery_at: p.delivery_at,
                is_processed: p.is_processed,
                time_diff_minutes: Math.round((now.getTime() - new Date(p.delivery_at).getTime()) / 60000),
                should_process: now >= new Date(p.delivery_at) && p.is_processed === 0
            }))
        );
        
        // Более простой запрос с использованием прямого сравнения строковых представлений дат
        const posts = await DB.query(
            `SELECT id, title, delivery_at FROM Post 
             WHERE DATE_FORMAT(delivery_at, '%Y-%m-%d %H:%i') <= DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') 
             AND is_processed = 0`
        );
        
        console.log(`[Scheduled Job] Found ${posts.length} posts to process using DATE_FORMAT`);
        
        // Если первый запрос не нашел сообщения, попробуем запрос напрямую по ID
        if (posts.length === 0 && allScheduled.length > 0) {
            // Ищем сообщения с is_processed=0, которые должны были быть отправлены (на основе JS сравнения)
            const shouldProcessIds = allScheduled
                .filter((p: ScheduledPost) => now >= new Date(p.delivery_at) && p.is_processed === 0)
                .map((p: ScheduledPost) => p.id);
                
            if (shouldProcessIds.length > 0) {
                console.log(`[Scheduled Job] Attempting direct processing of posts by IDs:`, shouldProcessIds);
                const postsById = await DB.query(
                    `SELECT id, title, delivery_at FROM Post WHERE id IN (:ids)`,
                    { ids: shouldProcessIds }
                );
                // Добавляем эти сообщения в основной массив для обработки
                posts.push(...postsById);
            }
        }
        
        // Обработка найденных сообщений
        for (const post of posts) {
            console.log(`[Scheduled Job] Processing post: ${post.id} - "${post.title}" scheduled for ${post.delivery_at}`);
            
            // Process each PostStudent record to insert into PostParent
            const postStudentIds = await DB.query(
                `SELECT id, student_id FROM PostStudent WHERE post_id = :post_id`,
                { post_id: post.id }
            );
            
            console.log(`[Scheduled Job] Found ${postStudentIds.length} students for post ${post.id}`);
            
            for (const ps of postStudentIds) {
                const studentAttachList = await DB.query(
                    `SELECT sp.parent_id FROM StudentParent AS sp WHERE sp.student_id = :student_id`,
                    { student_id: ps.student_id }
                );
                
                if (studentAttachList.length > 0) {
                    console.log(`[Scheduled Job] Adding ${studentAttachList.length} parents for student ${ps.student_id}`);
                    
                    const values = studentAttachList
                        .map((parent: any) => `(${ps.id}, ${parent.parent_id})`)
                        .join(', ');
                    
                    await DB.execute(
                        `INSERT INTO PostParent (post_student_id, parent_id) VALUES ${values}`
                    );
                } else {
                    console.log(`[Scheduled Job] No parents found for student ${ps.student_id}`);
                }
            }

            // Mark post as processed
            await DB.execute(
                `UPDATE Post SET is_processed = 1 WHERE id = :post_id`,
                { post_id: post.id }
            );
            
            console.log(`[Scheduled Job] Successfully processed post ${post.id}`);
        }
    } catch (e) {
        console.error('[Scheduled Job] Error in scheduled job:', e);
    }
});

console.log('[Scheduled Job] Scheduled job for posts initialized');
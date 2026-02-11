/**
 * 邮件发送工具 - 基于 Resend API
 */

// 生成 6 位数字验证码
export function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// 通过 Resend 发送验证码邮件
export async function sendVerificationCode(env, toEmail, code) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.RESEND_FROM || 'noreply@suyuank.top',
            to: [toEmail],
            subject: '【溯源客】邮箱验证码',
            html: `
                <div style="max-width: 480px; margin: 0 auto; padding: 40px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px; color: #e2e8f0;">
                    <h2 style="text-align: center; margin: 0 0 10px; color: #38bdf8; font-size: 24px;">溯源客</h2>
                    <p style="text-align: center; color: #94a3b8; margin: 0 0 30px; font-size: 14px;">邮箱验证码</p>
                    <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 25px; text-align: center; margin-bottom: 25px;">
                        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #38bdf8;">${code}</div>
                    </div>
                    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">验证码有效期为 <strong style="color: #e2e8f0;">5 分钟</strong>，请勿将验证码告知他人。</p>
                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 25px 0;" />
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">如非本人操作，请忽略此邮件。</p>
                </div>
            `
        })
    })

    if (!res.ok) {
        const err = await res.text()
        console.error('Resend 发送失败:', err)
        throw new Error('邮件发送失败')
    }

    return await res.json()
}

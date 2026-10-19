-- scripts/cost-report.sql
-- تقرير التكلفة الحقيقية من cost_log (أرقام الخدمات نفسها). الأسعار بالدولار من صفحات الأسعار الرسمية
-- وقت الكتابة — تُحدَّث هنا إن تغيّرت: Sonnet 4.6 ‏3/15 لكل مليون رمز، Haiku 4.5 ‏1/5،
-- صوت Gemini Flash Lite TTS ‏6 لكل مليون رمز صوت (25 رمزًا/ثانية) ويتضاعف 2027، صورة Flash Image ‏0.039.
with priced as (
  select *,
    case
      when fn = 'ai-assist' and model like 'claude-haiku%' then (coalesce(input_tokens,0) * 1 + coalesce(output_tokens,0) * 5) / 1e6
      when fn = 'ai-assist' then (coalesce(input_tokens,0) * 3 + coalesce(output_tokens,0) * 15) / 1e6
      when fn = 'tts' and not cached then coalesce(audio_seconds,0) * 25 * 6 / 1e6
      when fn = 'card-image' then coalesce(images,0) * 0.039
      else 0 end as usd
  from cost_log
)
select fn, action, count(*) as requests, count(*) filter (where cached) as cached,
  round(sum(usd)::numeric, 4) as usd_total, round(avg(usd)::numeric, 5) as usd_avg,
  round(avg(input_tokens)) as avg_in, round(avg(output_tokens)) as avg_out, round(avg(audio_seconds), 1) as avg_sec
from priced group by 1, 2 order by usd_total desc;

-- تكلفة صفحة الكتاب الكاملة (مجموع جملها) الآن وفي 2027:
-- select page_key, sum(audio_seconds) as sec, round(sum(audio_seconds)*25*6/1e6, 5) as usd_now, round(sum(audio_seconds)*25*12/1e6, 5) as usd_2027
-- from cost_log where fn='tts' and page_key is not null and not cached group by 1 order by 2 desc;

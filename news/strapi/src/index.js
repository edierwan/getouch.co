'use strict';

module.exports = {
  register() {},

  async bootstrap({ strapi }) {
    // Make article and source APIs public (read-only)
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (publicRole) {
      const permsToEnable = [
        { action: 'api::article.article.find' },
        { action: 'api::article.article.findOne' },
        { action: 'api::source.source.find' },
        { action: 'api::source.source.findOne' },
        { action: 'api::setting.setting.find' },
      ];

      for (const perm of permsToEnable) {
        const existing = await strapi
          .query('plugin::users-permissions.permission')
          .findOne({ where: { action: perm.action, role: publicRole.id } });
        if (!existing) {
          await strapi.query('plugin::users-permissions.permission').create({
            data: { action: perm.action, role: publicRole.id },
          });
        }
      }
    }

    // Seed sources
    const sourceCount = await strapi.query('api::source.source').count();
    if (sourceCount === 0) {
      const sources = [
        { name: 'Bernama', type: 'rss', feed_url: 'https://www.bernama.com/bm/rss/news.xml', country: 'Malaysia', language: 'bm', category: 'politics', is_active: true, priority: 10 },
        { name: 'Malaysiakini BM', type: 'rss', feed_url: 'https://www.malaysiakini.com/columns/rss/bm', country: 'Malaysia', language: 'bm', category: 'politics', is_active: true, priority: 9 },
        { name: 'The Star', type: 'rss', feed_url: 'https://www.thestar.com.my/rss/News', country: 'Malaysia', language: 'en', category: 'politics', is_active: true, priority: 8 },
        { name: 'Berita Harian', type: 'rss', feed_url: 'https://www.bharian.com.my/rss/berita', country: 'Malaysia', language: 'bm', category: 'politics', is_active: true, priority: 9 },
        { name: 'Reuters World', type: 'rss', feed_url: 'https://feeds.reuters.com/Reuters/worldNews', country: 'World', language: 'en', category: 'world', is_active: true, priority: 7 },
      ];

      for (const src of sources) {
        await strapi.query('api::source.source').create({ data: src });
      }
      strapi.log.info('✅ Seeded 5 news sources');
    }

    // Seed articles
    const articleCount = await strapi.query('api::article.article').count();
    if (articleCount === 0) {
      const now = new Date();
      const articles = [
        {
          title: 'PM Anwar Umum Pakej Ekonomi Baru Bernilai RM50 Bilion',
          slug: 'pm-anwar-umum-pakej-ekonomi-baru',
          excerpt: 'Perdana Menteri Datuk Seri Anwar Ibrahim hari ini mengumumkan pakej rangsangan ekonomi baru bernilai RM50 bilion untuk memperkukuhkan ekonomi negara.',
          content_html: '<p>KUALA LUMPUR - Perdana Menteri Datuk Seri Anwar Ibrahim hari ini mengumumkan pakej rangsangan ekonomi baru bernilai RM50 bilion yang bertujuan untuk memperkukuhkan ekonomi negara dan meningkatkan taraf hidup rakyat.</p><p>Pakej ini merangkumi inisiatif dalam sektor pendidikan, kesihatan, infrastruktur dan teknologi digital. Antaranya termasuk pembinaan 10,000 unit rumah mampu milik, peluasan akses internet berkelajuan tinggi ke kawasan luar bandar, dan peningkatan peruntukan untuk pendidikan STEM.</p><p>"Ini adalah pelaburan masa depan kita. Setiap ringgit yang dibelanjakan akan memberi pulangan berganda kepada rakyat," kata Anwar dalam sidang media di Putrajaya.</p><p>Pakej ini juga memperuntukkan RM5 bilion khusus untuk pembangunan usahawan muda dan perusahaan kecil dan sederhana (PKS), termasuk geran tanpa faedah sehingga RM100,000 untuk perniagaan teknologi.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&h=630&fit=crop',
          source_name: 'Bernama',
          source_url: 'https://www.bernama.com',
          original_published_at: new Date(now - 2 * 3600000).toISOString(),
          category: 'politics',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'PM Anwar mengumumkan pakej ekonomi RM50 bilion untuk memperkukuhkan ekonomi negara, merangkumi pendidikan, kesihatan, infrastruktur, teknologi digital, dan RM5 bilion untuk usahawan muda.',
          status: 'published',
          publishedAt: new Date(now - 2 * 3600000).toISOString(),
        },
        {
          title: 'PETRONAS Catat Keuntungan Bersih RM48.6 Bilion Untuk 2024',
          slug: 'petronas-catat-keuntungan-bersih-2024',
          excerpt: 'PETRONAS melaporkan keuntungan bersih RM48.6 bilion untuk tahun kewangan 2024, peningkatan 12% berbanding tahun sebelumnya.',
          content_html: '<p>KUALA LUMPUR - Petroliam Nasional Berhad (PETRONAS) hari ini melaporkan keuntungan bersih sebanyak RM48.6 bilion untuk tahun kewangan berakhir 31 Disember 2024, meningkat 12 peratus berbanding RM43.4 bilion tahun sebelumnya.</p><p>Hasil kumpulan meningkat kepada RM303 bilion daripada RM280 bilion, didorong oleh harga minyak mentah yang stabil dan peningkatan pengeluaran gas asli cecair (LNG).</p><p>Presiden dan Ketua Pegawai Eksekutif Kumpulan, Tan Sri Muhammad Taufik berkata prestasi kukuh ini mencerminkan strategi korporat yang berkesan dan kecekapan operasi yang berterusan.</p><p>"PETRONAS terus komited dalam peralihan tenaga, dengan pelaburan RM15 bilion dalam tenaga boleh baharu dan teknologi hijau sepanjang tahun ini," katanya.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=1200&h=630&fit=crop',
          source_name: 'Berita Harian',
          source_url: 'https://www.bharian.com.my',
          original_published_at: new Date(now - 4 * 3600000).toISOString(),
          category: 'business',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'PETRONAS mencatat keuntungan bersih RM48.6 bilion untuk 2024, naik 12%. Hasil kumpulan meningkat kepada RM303 bilion. Syarikat melabur RM15 bilion dalam tenaga boleh baharu.',
          status: 'published',
          publishedAt: new Date(now - 4 * 3600000).toISOString(),
        },
        {
          title: 'Malaysia Lonjak Ke Kedudukan 12 Dunia Dalam Indeks Inovasi Global',
          slug: 'malaysia-lonjak-indeks-inovasi-global',
          excerpt: 'Malaysia mencatat lonjakan besar dalam Indeks Inovasi Global 2024, naik ke kedudukan ke-12 daripada ke-36 tahun sebelumnya.',
          content_html: '<p>GENEVA - Malaysia telah mencatat lonjakan luar biasa dalam Indeks Inovasi Global (GII) 2024 yang dikeluarkan oleh Pertubuhan Harta Intelek Dunia (WIPO), melompat ke kedudukan ke-12 daripada ke-36 tahun sebelumnya.</p><p>Pencapaian ini menjadikan Malaysia negara ASEAN tertinggi dalam indeks tersebut, mengatasi Singapura yang berada di kedudukan ke-15.</p><p>Menteri Sains, Teknologi dan Inovasi berkata pencapaian ini hasil daripada pelaburan berterusan dalam penyelidikan dan pembangunan (R&D), ekosistem startup yang berkembang pesat, dan transformasi digital yang menyeluruh.</p><p>Antara faktor utama yang menyumbang kepada peningkatan ini termasuk:\n<ul><li>Peningkatan 40% dalam perbelanjaan R&D kebangsaan</li><li>Pertumbuhan 200% bilangan startup teknologi sejak 2020</li><li>Pengembangan pusat data dan infrastruktur AI</li><li>Kerjasama kukuh antara universiti dan industri</li></ul></p>',
          cover_image_url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&h=630&fit=crop',
          source_name: 'Bernama',
          source_url: 'https://www.bernama.com',
          original_published_at: new Date(now - 6 * 3600000).toISOString(),
          category: 'technology',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'Malaysia melonjak ke kedudukan ke-12 dalam Indeks Inovasi Global 2024, mengatasi Singapura. Hasil pelaburan R&D, pertumbuhan startup 200%, dan pengembangan infrastruktur AI.',
          status: 'published',
          publishedAt: new Date(now - 6 * 3600000).toISOString(),
        },
        {
          title: 'Harimau Malaya Layak Ke Piala Asia 2027 Selepas Belasah Thailand 3-0',
          slug: 'harimau-malaya-layak-piala-asia-2027',
          excerpt: 'Pasukan bola sepak kebangsaan Malaysia, Harimau Malaya, berjaya melayakkan diri ke Piala Asia 2027 selepas menewaskan Thailand 3-0.',
          content_html: '<p>KUALA LUMPUR - Kegembiraan menyelubungi Stadium Nasional Bukit Jalil apabila Harimau Malaya berjaya menewaskan Thailand 3-0 dalam perlawanan kelayakan Piala Asia 2027 yang berlangsung di hadapan 85,000 penonton.</p><p>Gol-gol dijaringkan oleh Safawi Rasid (minit ke-23), Arif Aiman (minit ke-56) dan Faisal Halim (minit ke-78), memberikan kemenangan meyakinkan kepada skuad kendalian jurulatih Kim Pan Gon.</p><p>Ini adalah kali pertama Malaysia melayakkan diri ke Piala Asia sejak 2007, dan kemenangan ini disambut dengan penuh kegembiraan oleh penyokong yang memenuhi stadium.</p><p>"Ini untuk rakyat Malaysia. Kami telah bekerja keras dan pemain-pemain menunjukkan semangat juang yang luar biasa," kata Kim Pan Gon dalam sidang media selepas perlawanan.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=630&fit=crop',
          source_name: 'The Star',
          source_url: 'https://www.thestar.com.my',
          original_published_at: new Date(now - 8 * 3600000).toISOString(),
          category: 'sports',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'Harimau Malaya layak ke Piala Asia 2027 selepas kemenangan 3-0 ke atas Thailand. Gol oleh Safawi, Arif Aiman dan Faisal Halim. Kelayakan pertama sejak 2007.',
          status: 'published',
          publishedAt: new Date(now - 8 * 3600000).toISOString(),
        },
        {
          title: 'Global AI Summit 2025: World Leaders Agree on AI Safety Framework',
          slug: 'global-ai-summit-2025-safety-framework',
          excerpt: 'Leaders from 80 nations signed the historic Zurich Accord on AI Safety, establishing binding regulations for artificial intelligence development.',
          content_html: '<p>ZURICH - In a landmark moment for technology governance, leaders from 80 nations have signed the Zurich Accord on AI Safety, establishing the first legally binding international framework for artificial intelligence development and deployment.</p><p>The agreement, reached after three days of intensive negotiations at the Global AI Summit 2025, includes provisions for mandatory safety testing of AI systems, transparency requirements for AI-generated content, and the creation of an International AI Safety Board.</p><p>Key provisions of the accord include:</p><ul><li>Mandatory pre-deployment safety assessments for AI systems above a specified capability threshold</li><li>Required watermarking of all AI-generated content</li><li>Establishment of the International AI Safety Board (IASB) with enforcement powers</li><li>A $10 billion global fund for AI safety research</li><li>Protection frameworks for workers displaced by AI automation</li></ul><p>"This is humanity taking control of its technological future," said the UN Secretary-General at the signing ceremony. "For the first time, we have a shared rulebook for the most powerful technology ever created."</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop',
          source_name: 'Reuters',
          source_url: 'https://www.reuters.com',
          original_published_at: new Date(now - 10 * 3600000).toISOString(),
          category: 'technology',
          region: 'dunia',
          language: 'en',
          ai_summary: '80 nations signed the Zurich Accord on AI Safety, establishing mandatory safety testing, content watermarking, and creating the International AI Safety Board with $10B research fund.',
          status: 'published',
          publishedAt: new Date(now - 10 * 3600000).toISOString(),
        },
        {
          title: 'Banjir Kilat Di Lembah Klang: 5,000 Penduduk Dipindahkan',
          slug: 'banjir-kilat-lembah-klang-5000-dipindahkan',
          excerpt: 'Hujan lebat selama enam jam menyebabkan banjir kilat teruk di beberapa kawasan di Lembah Klang, memaksa pemindahan lebih 5,000 penduduk.',
          content_html: '<p>KUALA LUMPUR - Hujan lebat yang berterusan selama enam jam sejak tengah malam tadi telah menyebabkan banjir kilat teruk di beberapa kawasan di Lembah Klang, memaksa pemindahan lebih 5,000 penduduk ke pusat pemindahan sementara.</p><p>Antara kawasan yang terjejas teruk termasuk Shah Alam Seksyen 24, Subang Jaya, Petaling Jaya dan beberapa kawasan di Kuala Lumpur termasuk Kampung Baru dan Jalan Tun Razak.</p><p>Agensi Pengurusan Bencana Negara (NADMA) telah mengaktifkan 15 pusat pemindahan di seluruh Lembah Klang.</p><p>"Kami memohon orang ramai untuk mengelak daripada kawasan banjir dan mengikut arahan pihak berkuasa. Operasi menyelamat sedang giat dijalankan," kata Ketua Pengarah NADMA.</p><p>Jabatan Meteorologi Malaysia meramalkan hujan lebat akan berterusan sehingga petang esok.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=1200&h=630&fit=crop',
          source_name: 'Bernama',
          source_url: 'https://www.bernama.com',
          original_published_at: new Date(now - 12 * 3600000).toISOString(),
          category: 'environment',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'Banjir kilat teruk di Lembah Klang akibat hujan 6 jam, 5,000 penduduk dipindahkan. Shah Alam, Subang Jaya, PJ terjejas teruk. 15 pusat pemindahan diaktifkan.',
          status: 'published',
          publishedAt: new Date(now - 12 * 3600000).toISOString(),
        },
        {
          title: 'Ringgit Mengukuh Ke Paras Tertinggi Dalam Tempoh 3 Tahun',
          slug: 'ringgit-mengukuh-paras-tertinggi-3-tahun',
          excerpt: 'Ringgit Malaysia mengukuh ke paras 3.95 berbanding dolar AS, paras tertinggi dalam tempoh tiga tahun, didorong aliran masuk pelaburan asing.',
          content_html: '<p>KUALA LUMPUR - Ringgit Malaysia terus mengukuh dan mencecah paras 3.95 berbanding dolar Amerika Syarikat (AS) hari ini, paras tertinggi dalam tempoh tiga tahun, didorong oleh aliran masuk pelaburan asing yang kukuh dan keyakinan pelabur terhadap ekonomi negara.</p><p>Penganalisis pasaran berkata pengukuhan ringgit ini disokong oleh beberapa faktor termasuk peningkatan eksport elektronik dan semikonduktor, kemasukan pelaburan langsung asing (FDI) yang mencatat rekod baharu, serta dasar fiskal kerajaan yang pragmatik.</p><p>Bank Negara Malaysia (BNM) dalam kenyataan berkata pengukuhan mata wang ini mencerminkan asas ekonomi Malaysia yang kukuh dan prospek pertumbuhan yang positif.</p><p>"Kami menjangkakan ringgit akan terus stabil pada paras semasa dengan potensi pengukuhan selanjutnya menjelang akhir tahun," kata Ketua Ekonomi AmBank Research.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=630&fit=crop',
          source_name: 'Malaysiakini',
          source_url: 'https://www.malaysiakini.com',
          original_published_at: new Date(now - 14 * 3600000).toISOString(),
          category: 'business',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'Ringgit mengukuh ke RM3.95/USD, paras tertinggi 3 tahun. Didorong aliran FDI rekod, eksport semikonduktor kukuh, dan dasar fiskal pragmatik.',
          status: 'published',
          publishedAt: new Date(now - 14 * 3600000).toISOString(),
        },
        {
          title: 'KL-Singapore HSR Project Back on Track With New Agreement',
          slug: 'kl-singapore-hsr-new-agreement',
          excerpt: 'Malaysia and Singapore have signed a new agreement to revive the Kuala Lumpur-Singapore High Speed Rail project with a revised budget of RM68 billion.',
          content_html: '<p>PUTRAJAYA - Malaysia and Singapore have signed a new bilateral agreement to revive the Kuala Lumpur-Singapore High Speed Rail (HSR) project, with construction set to begin in early 2026.</p><p>The revised project, with an estimated budget of RM68 billion, will feature an enhanced design incorporating the latest high-speed rail technology and improved sustainability features.</p><p>Under the new agreement, the 350km journey between KL and Singapore will take approximately 90 minutes, with intermediate stops at Putrajaya, Seremban, Melaka, Muar, Batu Pahat, and Iskandar Puteri.</p><p>The project is expected to create over 100,000 jobs during construction and transform economic corridors along its route. Both governments have agreed on a 60-40 cost-sharing arrangement, with Malaysia bearing the larger share.</p><p>"This project will redefine connectivity between our two nations and catalyse economic growth across the entire southern corridor," said the Malaysian Transport Minister at the signing ceremony.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1200&h=630&fit=crop',
          source_name: 'The Star',
          source_url: 'https://www.thestar.com.my',
          original_published_at: new Date(now - 18 * 3600000).toISOString(),
          category: 'politics',
          region: 'malaysia',
          language: 'en',
          ai_summary: 'KL-Singapore HSR revived with RM68B budget. 350km in 90 minutes with 6 intermediate stops. Construction starts early 2026, creating 100,000+ jobs. 60-40 cost sharing.',
          status: 'published',
          publishedAt: new Date(now - 18 * 3600000).toISOString(),
        },
        {
          title: 'Kajian: Rakyat Malaysia Habiskan Purata 8 Jam Sehari Di Media Sosial',
          slug: 'kajian-rakyat-malaysia-8-jam-media-sosial',
          excerpt: 'Kajian terbaru mendapati rakyat Malaysia menghabiskan purata lapan jam sehari di platform media sosial, tertinggi di Asia Tenggara.',
          content_html: '<p>KUALA LUMPUR - Satu kajian terbaru yang dijalankan oleh Institut Penyelidikan Digital Asia (ADRI) mendapati rakyat Malaysia menghabiskan purata lapan jam sehari di platform media sosial, menjadikannya tertinggi di rantau Asia Tenggara.</p><p>Kajian yang melibatkan 10,000 responden dari seluruh negara mendapati TikTok menjadi platform paling popular dengan purata 3.2 jam penggunaan harian, diikuti Instagram (2.1 jam), WhatsApp (1.5 jam) dan Facebook (1.2 jam).</p><p>Pakar psikologi dari Universiti Malaya, Prof Dr Aminah Zainal memberi amaran tentang kesan negatif penggunaan media sosial yang berlebihan terhadap kesihatan mental, terutamanya dalam kalangan remaja.</p><p>"Kami melihat peningkatan kes kemurungan dan kebimbangan yang berkait rapat dengan penggunaan media sosial yang berlebihan. Ibu bapa perlu memantau penggunaan anak-anak mereka," katanya.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&h=630&fit=crop',
          source_name: 'Berita Harian',
          source_url: 'https://www.bharian.com.my',
          original_published_at: new Date(now - 22 * 3600000).toISOString(),
          category: 'lifestyle',
          region: 'malaysia',
          language: 'bm',
          ai_summary: 'Rakyat Malaysia habiskan purata 8 jam sehari di media sosial, tertinggi di ASEAN. TikTok paling popular (3.2 jam), diikuti Instagram (2.1 jam). Pakar bimbang kesan kesihatan mental.',
          status: 'published',
          publishedAt: new Date(now - 22 * 3600000).toISOString(),
        },
        {
          title: 'WHO Declares End of Global Health Emergency as New Vaccine Shows 99% Efficacy',
          slug: 'who-declares-end-health-emergency-vaccine',
          excerpt: 'The World Health Organization officially declared the end of the global health advisory following the successful rollout of a revolutionary new vaccine.',
          content_html: '<p>GENEVA - The World Health Organization (WHO) has officially declared the end of the global health advisory status following the successful worldwide rollout of a revolutionary new mRNA-based universal vaccine.</p><p>The vaccine, developed through an unprecedented collaboration between research institutions across 30 countries, has demonstrated 99.2% efficacy in clinical trials involving over 500,000 participants.</p><p>WHO Director-General Dr. Tedros Adhanom Ghebreyesus praised the global scientific community for the achievement. "This represents the triumph of international cooperation and scientific innovation. We have proven that when the world works together, we can overcome any health challenge."</p><p>The vaccine has already been administered to over 2 billion people worldwide, with manufacturing hubs established in every major region to ensure equitable access.</p>',
          cover_image_url: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=1200&h=630&fit=crop',
          source_name: 'Reuters',
          source_url: 'https://www.reuters.com',
          original_published_at: new Date(now - 26 * 3600000).toISOString(),
          category: 'health',
          region: 'dunia',
          language: 'en',
          ai_summary: 'WHO ends global health advisory after new universal vaccine shows 99.2% efficacy. Developed by 30-nation collaboration, already administered to 2 billion people worldwide.',
          status: 'published',
          publishedAt: new Date(now - 26 * 3600000).toISOString(),
        },
      ];

      for (const article of articles) {
        await strapi.query('api::article.article').create({ data: article });
      }
      strapi.log.info('✅ Seeded 10 test articles');
    }
  },
};

const questions = [
    { text: "Q1 アドレスはどちらが楽？", a: "膝をやや伸ばす", b: "膝をやや曲げる", type: "AB" },
    { text: "Q2 手をつかずに椅子に座る時、動きとして自分の近い方はどっち？", a: "お尻を後ろに引いて座る", b: "膝を前に出して座る", type: "AB" },
    { text: "Q3 椅子に座った状態でつま先と膝を壁につけて、立ち上がってみてください。※裸足で診断していただくとより精度が上がります。", a: "無理なく立てる", b: "無理すれば立てる、もしくは立てない", type: "AB" },
    { text: "Q4 「お先」のパターはどちらが安定する？", a: "左足軸", b: "右足軸", type: "AB" },
    { text: "Q5 スタンスはどちらが振りやすい？", a: "広め", b: "狭め", type: "CP" },
    { text: "Q6 走る時の腕の振り方はどちらが自然？", a: "前でやや交差", b: "体の横でまっすぐ", type: "CP" },
    { text: "Q7 車を運転するとき、どちらの方が楽？", a: "座席とハンドルの位置はやや遠く、腕は伸ばし気味", b: "座席とハンドルの位置はやや近く、腕は曲げ気味で肘が体側寄りにある", type: "CP" },
    { text: "Q8 ビンやペットボトルの蓋を開ける時どちらが開けやすい？", a: "親・人差・中指", b: "親・中・薬指", type: "12" },
    { text: "Q9 うちわで仰ぐ時どちらが自然？", a: "手首中心", b: "肘から動かす", type: "AB" },
    { text: "Q10 紙に文字を書く時、身体の向きに対して、紙を斜めにする方が文字が書きやすい。", a: "はい", b: "いいえ", type: "CP" },
    { text: "Q11 肩の力を抜いて直立した時、手の甲の向きはどちらですか？", a: "正面寄り", b: "横向き寄り", type: "CP" },
];

const results = {
    A1: {
        id: "rabbit",
        name: "ふわ飛びうさぎタイプ（A1）",
        features: ["前重心でつま先内側に乗りやすい", "上半身主導で体を上に使う", "2軸で斜めに、幅広く動くのが自然", "ゆったりしたリズムで大きく動くのが得意"],
        swing: ["大きめのアドレス（スタンス広め・ボールとの距離は遠め）", "やや猫背", "膝を曲げて腰を落とすというより、腰を折るイメージ", "グリップは指で握り、ややフックグリップ", "テークバックは上に引き上げるような動き", "脇は締める方がイメージしやすい", "体重移動が大きい（2軸で回る）", "進行方向前側で踏ん張る（右打ちの方は左足側）"],
        notes: ["スウェーを気にして、コンパクトにまとめすぎると動きが詰まりやすい", "膝で腰を落とす、かかと体重などはいいスイングイメージが湧きづらく軸がブレやすい"],
        advice: ["「上に伸びるイメージ」で振るのが◎", "スイングは“横”より“斜め上”の意識", "リズム重視でゆったり振ると本来の力が出る"]
    },
    A2: {
        id: "flamingo",
        name: "スリムなフラミンゴタイプ（A2）",
        features: ["前重心でつま先内側", "上半身重心で縦に伸びる", "1軸でまっすぐコンパクト", "背筋が伸びた動きが自然"],
        swing: ["小さめのアドレス（スタンス狭め・ボールとの距離は近め）", "やや背筋を伸ばすイメージ", "膝を曲げて腰を落とすというより、腰を折るイメージ", "グリップは指で握り、ややウィークグリップ", "テークバックは上に引き上げるような動き", "脇は締める方がイメージしやすい", "体重移動が小さい（1軸で回る）", "進行方向前側で踏ん張る（右打ちの方は左足側）"],
        notes: ["大きく振ろうとして、横に広げすぎると軸が崩れる", "膝で腰を落とす、かかと体重などはいいスイングイメージが湧きづらく軸がぶれやすい"],
        advice: ["「真上に伸びる」意識", "コンパクトでOK", "軸キープ最優先"]
    },
    B1: {
        id: "duck",
        name: "しずかなアヒルタイプ（B1）",
        features: ["後ろ重心（かかと寄り）", "下半身重心", "1軸でまっすぐ", "背筋は伸びたまま、膝で重心を落とす"],
        swing: ["小さめのアドレス（スタンス狭め・ボールとの距離は近め）", "やや背筋を伸ばすイメージ", "腰を折って前傾というより、膝を曲げて腰を落とすイメージ", "グリップは手のひらで握り、ややウィークグリップ", "テークバックは膝を使って地面と平行に回るイメージ（内股気味）", "脇は開ける方がイメージしやすい", "体重移動が小さい（1軸で回る）", "進行方向後ろ側で踏ん張る（右打ちの方は右足側）"],
        notes: ["上に伸びようとすると不自然になる", "大きく振ろうとするとバランス崩れる"],
        advice: ["「下で支える」意識", "膝を使って回る", "脇や肘は自由度高めに"]
    },
    B2: {
        id: "bear",
        name: "ゆったりくまタイプ（B2）",
        features: ["後ろ重心（かかと外側）", "下半身主導", "2軸で斜めに広く使う", "どっしり安定型"],
        swing: ["大きめのアドレス（スタンス広め・ボールとの距離は遠め）", "やや猫背", "腰を折って前傾というより、膝を曲げて腰を落とすイメージ", "グリップは手のひらで握り、ややフックグリップ", "テークバックは膝を使って地面と平行に回るイメージ（内股気味）", "脇は開ける方がイメージしやすい。", "体重移動が大きい（2軸で回る）", "進行方向後ろ側で踏ん張る（右打ちの方は右足側）"],
        notes: ["コンパクトにしすぎると力が出ない", "上半身が止まるとミスが出やすい"],
        advice: ["「下でどっしり」", "膝を使って大きく振る", "リズムゆったり"]
    }
};

let currentStep = 0;
let userAnswers = [];

const quizSection = document.getElementById('quiz-area');
const resultSection = document.getElementById('result-area');
const qText = document.getElementById('question-text');
const btnA = document.getElementById('choice-a');
const btnB = document.getElementById('choice-b');
const textA = document.getElementById('text-a');
const textB = document.getElementById('text-b');
const progressCore = document.getElementById('progress-core');
const progressText = document.getElementById('progress-text');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('intro').style.display = 'none';
    quizSection.style.display = 'block';
    showQuestion();
    window.scrollTo({ top: 0, behavior: 'auto' });
});

function showQuestion() {
    const q = questions[currentStep];
    qText.innerText = q.text;
    textA.innerText = q.a;
    textB.innerText = q.b;

    btnA.classList.toggle('selected', userAnswers[currentStep] === 'A');
    btnB.classList.toggle('selected', userAnswers[currentStep] === 'B');

    prevBtn.disabled = currentStep === 0;
    nextBtn.disabled = userAnswers[currentStep] === undefined;

    const percent = ((currentStep + 1) / questions.length) * 100;
    progressCore.style.width = percent + "%";
    progressText.innerText = `Q ${currentStep + 1} / ${questions.length}`;
}

function handleAnswer(choice) {
    userAnswers[currentStep] = choice;
    if (currentStep < questions.length - 1) {
        currentStep++;
        showQuestion();
    } else {
        showResult();
    }
}

btnA.addEventListener('click', () => handleAnswer('A'));
btnB.addEventListener('click', () => handleAnswer('B'));

prevBtn.addEventListener('click', () => {
    if (currentStep > 0) { currentStep--; showQuestion(); }
});

nextBtn.addEventListener('click', () => {
    if (currentStep < questions.length - 1) { currentStep++; showQuestion(); }
});

function showResult() {
    quizSection.style.display = 'none';
    resultSection.style.display = 'block';

    let scoreAB = { A: 0, B: 0 };
    let scoreCP = { Cross: 0, Parallel: 0 };
    let type12 = "";

    userAnswers.forEach((ans, i) => {
        const qNum = i + 1;
        if ([1, 2, 3, 4, 9].includes(qNum)) {
            const pts = (qNum === 2 || qNum === 3) ? 2 : 1;
            ans === 'A' ? scoreAB.A += pts : scoreAB.B += pts;
        }
        if ([5, 6, 7, 10, 11].includes(qNum)) {
            const pts = (qNum === 6 || qNum === 11) ? 2 : 1;
            ans === 'A' ? scoreCP.Cross += pts : scoreCP.Parallel += pts;
        }
        if (qNum === 8) {
            type12 = (ans === 'A') ? "1" : "2";
        }
    });

    const isA = scoreAB.A > scoreAB.B;
    const isCross = scoreCP.Cross > scoreCP.Parallel;
    let key = isA ? (isCross ? "A1" : "A2") : (isCross ? "B2" : "B1");

    let subNote = "";
    if (key === "A1" && type12 === "2") subNote = "A2タイプの可能性もあります。";
    if (key === "A2" && type12 === "1") subNote = "A1タイプの可能性もあります。";
    if (key === "B1" && type12 === "2") subNote = "B2タイプの可能性もあります。";
    if (key === "B2" && type12 === "1") subNote = "B1タイプの可能性もあります。";

    const isCloseAB = Math.abs(scoreAB.A - scoreAB.B) === 1;
    const isCloseCP = Math.abs(scoreCP.Cross - scoreCP.Parallel) === 1;
    const isMismatch = ((key === "A1" || key === "B1") && type12 === "2") ||
        ((key === "A2" || key === "B2") && type12 === "1");
    const forceError = (isCloseAB && isCloseCP && isMismatch);

    if (forceError) {
        resultSection.innerHTML = `
            <div class="result-container">
                <div class="type-header">
                    <img src="/images/swing-type/error-image.jpeg" alt="判定困難" class="type-image">
                    <h2 class="type-title" style="color:#d9534f; font-size:1.1rem;">判定が困難です</h2>
                    <p style="text-align:left; font-size:0.85rem; margin-top:25px; line-height:1.8; color:#636e72;">
                        大変申し訳ございません。問診のみでの診断が困難な回答のため、再度お試しいただくか、対面でのトレーナーによるタイプチェックをお勧めいたします。
                    </p>
                </div>
                <button class="quiz-btn" style="background:#cc217f; margin-top:20px;" onclick="location.reload()">最初からやり直す</button>
            </div>
        `;
        window.scrollTo(0, 0);
        return;
    }

    const data = results[key];
    const shareText = encodeURIComponent(`私のゴルフスイングは【${data.name}】でした！\nあなたの身体特性に合った理想的なスイングタイプをチェックしよう！\n#ゴルフスイング診断 #4スタンス理論 #JoaGOLFstudio`);
    const shareUrl = encodeURIComponent(window.location.href);

    const lineText = `私の診断結果は【${data.name}】でした！\n${window.location.href}`;
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(lineText)}`;

    resultSection.innerHTML = `
        <div class="result-container">
            <div class="type-header">
                <img src="/images/swing-type/${data.id}.jpeg" alt="${data.id}" class="type-image">
                <h2 class="type-title">${data.name}</h2>
                <p class="probability-text">の可能性が高いです！</p>
                <p class="disclaimer-text">※あくまで問診からの診断結果のため確定診断ではありません。</p>
                ${subNote ? `<div class="sub-note-text"><p style="color:#d9534f; font-weight:bold; margin:0; font-size:0.85rem;">※${subNote}</p></div>` : ""}
            </div>
            <div class="result-details">
                ${createBlock("■ 特徴", data.features)}
                ${createBlock("■ スイング傾向", data.swing)}
                ${createBlock("■ 注意点", data.notes)}
                ${createBlock("■ アドバイス", data.advice)}
            </div>
            <div class="supervisor">
                <p class="supervisor__label">監修</p>
                <div class="supervisor__inner">
                    <img class="supervisor__photo" src="/images/produce.jpg" alt="中村 彩夏">
                    <div class="supervisor__text">
                        <p class="supervisor__name">中村 彩夏（ナカムラ アヤカ）</p>
                        <p class="supervisor__name-en">AYAKA NAKAMURA</p>
                    </div>
                </div>
                <ul class="supervisor__titles">
                    <li>JoaGOLF STUDIO インストラクター</li>
                    <li>4スタンス理論（REASH理論）マスター級トレーナー</li>
                    <li>LGIA インストラクター育成講師</li>
                </ul>
                <p class="supervisor__bio">レギュラーツアー出場経験を持つ元ツアープロの父から受け継いだレッスン理論と、4スタンス理論を融合した独自メソッド『AYASTA Method』を考案。</p>
                <p class="supervisor__bio">一人ひとりの生まれ持った身体特性に合わせた指導を得意とし、「無理なく・楽しく・結果を出せるレッスン」を提供しています。</p>
            </div>
            <a href="/store/" class="quiz-btn" style="text-decoration: none; background-color:#cc217f; margin-top: 20px; display: block; line-height: 1.4;">
                タイプ別のスイング指導は<br>JoaGOLF STUDIOへ！
            </a>

            <button id="show-all-types" class="quiz-btn" style="background:#cc217f; margin-top:20px;">他のスイングタイプも見る</button>

            <div id="all-types-list" style="display:none; margin-top: 60px; text-align: left;">
                <hr style="margin: 60px 0; border: 0; border-top: 2px solid #eee;">
                <h2 style="text-align:center; margin-bottom: 40px;">全タイプ一覧</h2>

                ${Object.keys(results).map(typeKey => {
                    const item = results[typeKey];
                    return `
                        <div class="type-full-card" style="margin-bottom: 80px;">
                            <div class="type-header">
                                <img src="/images/swing-type/${item.id}.jpeg" alt="${item.id}" class="type-image">
                                <h2 class="type-title">${item.name}</h2>
                            </div>
                            <div class="result-details">
                                ${createBlock("■ 特徴", item.features)}
                                ${createBlock("■ スイング傾向", item.swing)}
                                ${createBlock("■ 注意点", item.notes)}
                                ${createBlock("■ アドバイス", item.advice)}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <button class="quiz-btn" style="background:#cc217f; margin-top:20px;" onclick="location.reload()">最初からやり直す</button>
            <div class="share-section" style="margin: 50px 0 20px; padding: 20px; background: #fdfdfd; border-radius: 12px; border: 1px solid #eee;">
                <p style="font-weight: bold; margin-bottom: 15px; font-size: 0.9rem;">結果を友達に共有する！</p>
                <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
                    <button id="copy-url-btn" class="quiz-btn" style="margin:0; flex:1; min-width:100px; background-color:#cc217f; font-size:0.85rem; padding:12px 5px; border:none; color:white;">URLコピー</button>
                    <a href="${lineUrl}" target="_blank" class="quiz-btn" style="margin:0; flex:1; min-width:100px; background-color:#06C755; font-size:0.85rem; padding:12px 5px; text-decoration:none; color:white;">LINE送る</a>
                    <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" class="quiz-btn" style="margin:0; flex:1; min-width:100px; background-color:#000000; font-size:0.85rem; padding:12px 5px; text-decoration:none; color:white;">Xでポスト</a>
                </div>
            </div>
        </div>
    `;

    document.getElementById('show-all-types').addEventListener('click', function () {
        document.getElementById('all-types-list').style.display = 'block';
        this.style.display = 'none';
        document.getElementById('all-types-list').scrollIntoView({ behavior: 'smooth' });
    });

    document.getElementById('copy-url-btn').addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            const toast = document.createElement('div');
            toast.className = 'copy-toast';
            toast.innerText = "URLをコピーしました！";
            document.body.appendChild(toast);

            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 500);
            }, 2000);
        });
    });

    window.scrollTo(0, 0);
}

function createBlock(title, list) {
    return `<div class="detail-block"><h3>${title}</h3><ul>${list.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
}

const URL = "https://teachablemachine.withgoogle.com/models/aqDpEu0a3/";

    async function createModel() {
        const checkpointURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        const recognizer = speechCommands.create(
            "BROWSER_FFT",
            undefined,
            checkpointURL,
            metadataURL
        );

        await recognizer.ensureModelLoaded();
        return recognizer;
    }

    async function init() {
        const recognizer = await createModel();
        const classLabels = recognizer.wordLabels(); 

        // リアルタイム認識の開始 (listen)
        recognizer.listen(result => {
            const scores = result.scores;
            for (let i = 0; i < classLabels.length; i++) {
                console.log(classLabels[i] + ": " + scores[i].toFixed(2));
            }
        }, {
            includeSpectrogram: true,
            probabilityThreshold: 0.75, // 認識閾値
            overlapFactor: 0.50
        });
    }
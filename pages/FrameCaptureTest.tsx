import React, { useState } from "react";
import { captureLastFrameFromVideoBlob } from "../services/frameService";
import {base64ToBlob} from "@/utils";

export default function FrameCaptureTest() {
    const [image, setImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);

    const onSelectVideo = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setImage(null);
        setProgress(0);
        setLoading(true);

        try {
            const b64 = await captureLastFrameFromVideoBlob(
                file,
                (p) => setProgress(p),
                0.12 // epsilon → detik sebelum akhir
            );

            let blob = base64ToBlob(b64);

            console.log("Captured frame blob:", blob);

            setImage(b64);
        } catch (err: any) {
            console.error(err);
            setError(err?.message || "Failed to capture frame");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h3>Last Frame Capture Test (Fast Seek)</h3>

            <input
                type="file"
                accept="video/mp4"
                onChange={onSelectVideo}
            />

            {loading && (
                <div style={{ marginTop: 10 }}>
                    Processing… {progress}%
                </div>
            )}

            {error && (
                <p style={{ color: "red", marginTop: 10 }}>
                    {error}
                </p>
            )}

            {image && (
                <img
                    src={image}
                    alt="Last frame"
                    style={{
                        marginTop: 20,
                        maxWidth: 400,
                        border: "2px solid green",
                    }}
                />
            )}
        </div>
    );
}


export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Only POST requests are allowed"
    });
  }

  const apiKey = process.env.REMOVE_BG_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "REMOVE_BG_API_KEY is not configured in Vercel"
    });
  }

  try {
    const { imageBase64 } = req.body || {};

    if (typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "imageBase64 must be a Base64 data URL"
      });
    }

    const match = imageBase64.match(
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid image format. Send a PNG, JPG, or WEBP Base64 data URL."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2].replace(/\s/g, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    if (!imageBuffer.length) {
      return res.status(400).json({
        error: "Image data is empty"
      });
    }

    // Check the actual file signature to avoid invalid image data.
    const validSignature =
      (mimeType === "image/png" &&
        imageBuffer.subarray(0, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        )) ||
      (mimeType === "image/jpeg" &&
        imageBuffer[0] === 0xff &&
        imageBuffer[1] === 0xd8) ||
      (mimeType === "image/webp" &&
        imageBuffer.toString("ascii", 0, 4) === "RIFF" &&
        imageBuffer.toString("ascii", 8, 12) === "WEBP");

    if (!validSignature) {
      return res.status(400).json({
        error: "Image bytes do not match the declared image format"
      });
    }

    const formData = new FormData();

    formData.append(
      "image_file",
      new Blob([imageBuffer], { type: mimeType }),
      mimeType === "image/png"
        ? "photo.png"
        : mimeType === "image/webp"
        ? "photo.webp"
        : "photo.jpg"
    );

    formData.append("size", "auto");

    const apiResponse = await fetch(
      "https://api.remove.bg/v1.0/removebg",
      {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey
        },
        body: formData
      }
    );

    if (!apiResponse.ok) {
      const apiError = await apiResponse.text();

      console.error(
        "Remove.bg error:",
        apiResponse.status,
        apiError.slice(0, 1000)
      );

      return res.status(502).json({
        error: "Remove.bg could not process the image. Check your API key, credits, and image format."
      });
    }

    const contentType =
      apiResponse.headers.get("content-type") || "";

    if (!contentType.includes("image/")) {
      return res.status(502).json({
        error: "Remove.bg did not return an image"
      });
    }

    const pngBuffer = Buffer.from(
      await apiResponse.arrayBuffer()
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(pngBuffer);

  } catch (error) {
    console.error("Backend error:", error);

    return res.status(500).json({
      error: "Server could not process the image"
    });
  }
}

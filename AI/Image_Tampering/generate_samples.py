import os
from PIL import Image, ImageDraw

def main():
    clean_dir = "samples/clean"
    tampered_dir = "samples/tampered"
    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(tampered_dir, exist_ok=True)
    
    # 1. passport.jpg (1920x1080) - A nice simulated passport
    img = Image.new("RGB", (1920, 1080), color=(245, 245, 240))
    draw = ImageDraw.Draw(img)
    # Draw passport border
    draw.rectangle([50, 50, 1870, 1030], outline=(40, 60, 100), width=10)
    # Draw photo placeholder with a mathematical gradient texture (simulating a real photo)
    import numpy as np
    photo_w, photo_h = 400, 500
    photo_arr = np.zeros((photo_h, photo_w, 3), dtype=np.uint8)
    for y in range(photo_h):
        for x in range(photo_w):
            photo_arr[y, x, 0] = int(x * 255 / photo_w)
            photo_arr[y, x, 1] = int(y * 255 / photo_h)
            photo_arr[y, x, 2] = int(128 + np.sin(x/10.0)*64 + np.cos(y/10.0)*64)
    photo_img = Image.fromarray(photo_arr)
    img.paste(photo_img, (100, 150))
    # Draw a thin black border around the photo
    draw.rectangle([100, 150, 500, 650], outline=(0, 0, 0), width=3)
    
    # Draw some text lines
    draw.text((600, 150), "REPUBLIC OF DOCSHIELD")
    draw.text((600, 220), "PASSPORT")
    draw.text((600, 320), "Surname: SMITH")
    draw.text((600, 370), "Given Names: JOHN")
    draw.text((600, 420), "Nationality: DOCSHIELDIAN")
    draw.text((600, 470), "Passport No: DS12345678")
    # Draw stamp placeholder
    draw.ellipse([1400, 650, 1700, 950], outline=(220, 50, 50), width=5)
    img.save(os.path.join(clean_dir, "passport.jpg"), format="JPEG", quality=95)
    
    # 1b. passport_edited.jpg (1920x1080) - A deliberately edited passport to test ELA anomalies
    # First, compress the clean image at a lower quality (70) in-memory to establish a base compression history
    import io
    temp_buf = io.BytesIO()
    img.save(temp_buf, format="JPEG", quality=70)
    temp_buf.seek(0)
    img_base = Image.open(temp_buf)
    
    img_edited = img_base.copy()
    draw_edited = ImageDraw.Draw(img_edited)
    # Erase the original passport number by drawing a rectangle block with background color
    draw_edited.rectangle([600, 460, 900, 490], fill=(245, 245, 240))
    # Overwrite with a forged passport number
    draw_edited.text((600, 470), "Passport No: DS99999999")
    # Paste a high-frequency noise block inside the photo area to simulate a grainy photo replacement
    np.random.seed(42)
    tamper_noise = np.random.randint(0, 256, (200, 200, 3), dtype=np.uint8)
    tamper_img = Image.fromarray(tamper_noise)
    img_edited.paste(tamper_img, (200, 250))
    # Add a bold forged stamp/seal in the middle of the document to test ELA anomaly detection
    draw_edited.ellipse([800, 700, 960, 860], outline=(0, 0, 200), width=10)
    # Save the final tampered image at a higher quality (95)
    img_edited.save(os.path.join(tampered_dir, "passport_edited.jpg"), format="JPEG", quality=95)
    
    # 2. document.png (800x600)
    img_png = Image.new("RGB", (800, 600), color=(255, 255, 255))
    draw_png = ImageDraw.Draw(img_png)
    draw_png.rectangle([20, 20, 780, 580], outline=(100, 100, 100), width=3)
    draw_png.text((50, 50), "OFFICIAL CERTIFICATE")
    draw_png.text((50, 100), "This is to certify that DocShield Phase 1 pipeline works.")
    img_png.save(os.path.join(clean_dir, "document.png"), format="PNG")
    
    # 3. document.webp (800x600)
    img_webp = Image.new("RGB", (800, 600), color=(250, 250, 250))
    draw_webp = ImageDraw.Draw(img_webp)
    draw_webp.text((50, 50), "WEBP Document Format")
    img_webp.save(os.path.join(clean_dir, "document.webp"), format="WEBP")
    
    # 4. small_image.jpg (50x50) - Small valid image
    img_small = Image.new("RGB", (50, 50), color=(0, 255, 0))
    img_small.save(os.path.join(clean_dir, "small_image.jpg"), format="JPEG")
    
    # 5. large_image.jpg (3000x2000)
    img_large = Image.new("RGB", (3000, 2000), color=(255, 250, 240))
    img_large.save(os.path.join(clean_dir, "large_image.jpg"), format="JPEG")
    
    # 6. gray_document.jpg (Grayscale)
    img_gray = Image.new("L", (800, 600), color=200)
    draw_gray = ImageDraw.Draw(img_gray)
    draw_gray.text((100, 100), "Grayscale Document")
    img_gray.save(os.path.join(clean_dir, "gray_document.jpg"), format="JPEG")
    
    # 7. corrupted.jpg (corrupt bytes)
    with open(os.path.join(tampered_dir, "corrupted.jpg"), "wb") as f:
        f.write(b"this is completely corrupted image data")
        
    # 8. invalid.txt (invalid extension / type)
    with open(os.path.join(tampered_dir, "invalid.txt"), "w") as f:
        f.write("Some simple text data.")
        
    print("Sample images generated successfully.")

if __name__ == "__main__":
    main()

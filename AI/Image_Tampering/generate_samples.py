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
    # Draw photo placeholder
    draw.rectangle([100, 150, 500, 650], fill=(200, 200, 200), outline=(0, 0, 0), width=3)
    # Draw some text lines
    draw.text((600, 150), "REPUBLIC OF DOCSHIELD")
    draw.text((600, 220), "PASSPORT")
    draw.text((600, 320), "Surname: SMITH")
    draw.text((600, 370), "Given Names: JOHN")
    draw.text((600, 420), "Nationality: DOCSHIELDIAN")
    draw.text((600, 470), "Passport No: DS12345678")
    # Draw stamp placeholder
    draw.ellipse([1400, 650, 1700, 950], outline=(220, 50, 50), width=5)
    img.save(os.path.join(clean_dir, "passport.jpg"), format="JPEG")
    
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

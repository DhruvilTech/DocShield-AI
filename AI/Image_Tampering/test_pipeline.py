import sys
import os
import traceback

# Configure stdout to use UTF-8 to prevent charmap encoding errors on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Add the directory containing the 'app' module to the python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.forensic.pipeline import run_forensic_pipeline_from_file
from app.schemas.forensic import ForensicResult

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_pipeline.py <path_to_image>")
        sys.exit(1)
        
    image_path = sys.argv[1]
    print("========================================")
    print("DOCSHIELD AI — PHASE 1 TEST")
    print("========================================")
    print(f"Input:\n{image_path}\n")
    
    try:
        # Run pipeline and request debug images to be saved
        result: ForensicResult = run_forensic_pipeline_from_file(
            image_path,
            save_debug=True
        )
        
        # Print structured results
        print("Image:")
        print(f"  Width: {result.image.width}")
        print(f"  Height: {result.image.height}")
        print(f"  Channels: {result.image.channels}")
        print(f"  Format: {result.image.format}")
        print()
        print("Working Image:")
        print(f"  Width: {result.image.working_width}")
        print(f"  Height: {result.image.working_height}")
        print()
        print("Quality:")
        print(f"  Brightness: {result.quality.brightness:.1f}")
        print(f"  Contrast: {result.quality.contrast:.1f}")
        print(f"  Sharpness: {result.quality.sharpness:.1f}")
        print(f"  Blur Detected: {result.quality.blur_detected}")
        print()
        print("Representations:")
        print(f"  Grayscale: {'✓' if result.representations.grayscale else '✗'}")
        print(f"  HSV: {'✓' if result.representations.hsv else '✗'}")
        print(f"  LAB: {'✓' if result.representations.lab else '✗'}")
        print(f"  Noise Residual: {'✓' if result.representations.noise_residual else '✗'}")
        print()
        print("Forensic Signals:")
        
        def format_signal(sig_obj):
            if sig_obj is None or not sig_obj.available:
                return "Not implemented"
            
            output = f"Available\n"
            output += f"    Anomaly Score: {sig_obj.score:.4f}\n"
            if sig_obj.statistics:
                output += "    Statistics:\n"
                for k, v in sig_obj.statistics.items():
                    output += f"      {k}: {v:.4f}\n"
            if sig_obj.regions:
                output += f"    Suspicious Regions ({len(sig_obj.regions)}):\n"
                for idx, r in enumerate(sig_obj.regions[:5]):  # Show up to 5 regions
                    output += f"      [{idx+1}] Coords: x={r.x}, y={r.y}, w={r.width}, h={r.height} | Score: {r.score:.3f} | Severity: {r.severity}\n"
                    output += f"          Reason: {r.reason}\n"
                if len(sig_obj.regions) > 5:
                    output += f"      ... and {len(sig_obj.regions) - 5} more regions.\n"
            else:
                output += "    Suspicious Regions: None detected\n"
            if sig_obj.heatmap_path:
                output += f"    Heatmap Path: {sig_obj.heatmap_path}\n"
            if sig_obj.map_path:
                output += f"    Raw Map Path: {sig_obj.map_path}"
            return output

        print(f"  ELA: {format_signal(result.signals.ela)}")
        print(f"  Noise: {format_signal(result.signals.noise)}")
        print(f"  Copy-Move: {format_signal(result.signals.copy_move)}")
        print(f"  Metadata: {format_signal(result.signals.metadata)}")
        print(f"  Stamp: {format_signal(result.signals.stamp)}")
        print(f"  Splicing: {format_signal(result.signals.splicing)}")
        print()
        print("Fusion:")
        print(f"  Score: {result.fusion.score if result.fusion.score is not None else 'Not available'}")
        print(f"  Risk Level: {result.fusion.risk_level if result.fusion.risk_level is not None else 'Not available'}")
        print()
        print("Debug files:")
        print("  outputs/debug/document_processed.jpg")
        print("  outputs/debug/document_gray.jpg")
        print("  outputs/debug/document_noise_residual.jpg")
        print("  outputs/debug/document_ela_heatmap.jpg")
        print("  outputs/debug/document_ela_map.png")
        print("  outputs/debug/document_noise_anomaly_map.png")
        print("  outputs/debug/document_noise_heatmap.jpg")
        print("  outputs/debug/document_copy_move_matches.jpg")
        print("  outputs/debug/document_copy_move_map.png")
        print("  outputs/debug/document_metadata.json")
        print()
        print("========================================")
        print("PIPELINE TEST PASSED")
        print("========================================")
        sys.exit(0)
        
    except FileNotFoundError as fnf:
        print(f"Error: {fnf}")
        print("========================================")
        print("PHASE 1 TEST FAILED (File Not Found)")
        print("========================================")
        sys.exit(1)
    except ValueError as ve:
        print(f"Validation/Preprocessing Error: {ve}")
        print("========================================")
        print("PHASE 1 TEST FAILED (Validation Failed)")
        print("========================================")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected Pipeline Error: {e}")
        traceback.print_exc()
        print("========================================")
        print("PHASE 1 TEST FAILED (Unexpected Error)")
        print("========================================")
        sys.exit(1)

if __name__ == "__main__":
    main()

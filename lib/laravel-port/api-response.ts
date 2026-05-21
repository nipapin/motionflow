import { NextResponse } from "next/server";

/**
 * Port of the private `prepareResponse` helper that lives in both
 * `App\Http\Controllers\ApiController` and `App\Http\Controllers\ApiStickSubsMf`:
 *
 * ```php
 * private function prepareResponse($data, $code = 200) {
 *     if (!is_array($data)) {
 *         $code = 400;
 *         $data = ['message' => $data];
 *     }
 *     $reqStatus = ['success' => $code == 200 ? true : false];
 *     return response()->json(array_merge($reqStatus, $data), $code);
 * }
 * ```
 *
 * Quirk preserved from Laravel for backward compat: when the caller passes a
 * **string** as data, the helper forces HTTP 400 regardless of the `code`
 * argument. Existing consumers rely on that behaviour.
 */
export function prepareResponse(
    data: Record<string, unknown> | string,
    code = 200,
): NextResponse {
    if (typeof data === "string") {
        return NextResponse.json({ success: false, message: data }, { status: 400 });
    }
    return NextResponse.json({ success: code === 200, ...data }, { status: code });
}

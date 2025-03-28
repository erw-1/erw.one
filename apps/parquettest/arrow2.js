let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);

            } else {
                state.a = a;
            }
        }
    };
    real.original = state;

    return real;
}
function __wbg_adapter_34(arg0, arg1, arg2) {
    wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h3d02e49d7de71efe(arg0, arg1, addHeapObject(arg2));
}

let cachedBigInt64Memory0 = null;

function getBigInt64Memory0() {
    if (cachedBigInt64Memory0 === null || cachedBigInt64Memory0.byteLength === 0) {
        cachedBigInt64Memory0 = new BigInt64Array(wasm.memory.buffer);
    }
    return cachedBigInt64Memory0;
}

let cachedBigUint64Memory0 = null;

function getBigUint64Memory0() {
    if (cachedBigUint64Memory0 === null || cachedBigUint64Memory0.byteLength === 0) {
        cachedBigUint64Memory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64Memory0;
}

function getArrayU64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigUint64Memory0().subarray(ptr / 8, ptr / 8 + len);
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8Memory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
* Read a Parquet file into Arrow data using the [`arrow2`](https://crates.io/crates/arrow2) and
* [`parquet2`](https://crates.io/crates/parquet2) Rust crates.
*
* This returns an Arrow table in WebAssembly memory. To transfer the Arrow table to JavaScript
* memory you have two options:
*
* - (Easier): Call {@linkcode Table.intoIPCStream} to construct a buffer that can be parsed with
*   Arrow JS's `tableFromIPC` function.
* - (More performant but bleeding edge): Call {@linkcode Table.intoFFI} to construct a data
*   representation that can be parsed zero-copy from WebAssembly with
*   [arrow-js-ffi](https://github.com/kylebarron/arrow-js-ffi).
*
* Example:
*
* ```js
* import { tableFromIPC } from "apache-arrow";
* // Edit the `parquet-wasm` import as necessary
* import { readParquet } from "parquet-wasm/node/arrow2";
*
* const resp = await fetch("https://example.com/file.parquet");
* const parquetUint8Array = new Uint8Array(await resp.arrayBuffer());
* const arrowWasmTable = readParquet(parquetUint8Array);
* const arrowTable = tableFromIPC(arrowWasmTable.intoIPCStream());
* ```
*
* @param parquet_file Uint8Array containing Parquet data
* @param {Uint8Array} parquet_file
* @returns {Table}
*/
export function readParquet(parquet_file) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(parquet_file, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.readParquet(retptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
            throw takeObject(r1);
        }
        return Table.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
* Read metadata from a Parquet file using the [`arrow2`](https://crates.io/crates/arrow2) and
* [`parquet2`](https://crates.io/crates/parquet2) Rust crates.
*
* Example:
*
* ```js
* // Edit the `parquet-wasm` import as necessary
* import { readMetadata } from "parquet-wasm/node/arrow2";
*
* const resp = await fetch("https://example.com/file.parquet");
* const parquetUint8Array = new Uint8Array(await resp.arrayBuffer());
* const parquetFileMetaData = readMetadata(parquetUint8Array);
* ```
*
* @param parquet_file Uint8Array containing Parquet data
* @returns a {@linkcode FileMetaData} object containing metadata of the Parquet file.
* @param {Uint8Array} parquet_file
* @returns {FileMetaData}
*/
export function readMetadata(parquet_file) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(parquet_file, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.readMetadata(retptr, ptr0, len0);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
            throw takeObject(r1);
        }
        return FileMetaData.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}
/**
* Read a single row group from a Parquet file into Arrow data using the
* [`arrow2`](https://crates.io/crates/arrow2) and [`parquet2`](https://crates.io/crates/parquet2)
* Rust crates.
*
* This returns an Arrow record batch in WebAssembly memory. To transfer the Arrow record batch to
* JavaScript memory you have two options:
*
* - (Easier): Call {@linkcode RecordBatch.intoIPCStream} to construct a buffer that can be parsed
*   with Arrow JS's `tableFromIPC` function.
* - (More performant but bleeding edge): Call {@linkcode RecordBatch.intoFFI} to construct a data
*   representation that can be parsed zero-copy from WebAssembly with
*   [arrow-js-ffi](https://github.com/kylebarron/arrow-js-ffi).
*
* Example:
*
* ```js
* import { tableFromIPC } from "apache-arrow";
* // Edit the `parquet-wasm` import as necessary
* import { readRowGroup, readMetadata } from "parquet-wasm/node/arrow2";
*
* const resp = await fetch("https://example.com/file.parquet");
* const parquetUint8Array = new Uint8Array(await resp.arrayBuffer());
* const parquetFileMetaData = readMetadata(parquetUint8Array);
*
* const arrowSchema = parquetFileMetaData.arrowSchema();
* // Read only the first row group
* const parquetRowGroupMeta = parquetFileMetaData.rowGroup(0);
*
* // Read only the first row group
* const arrowWasmBatch = readRowGroup(
*   parquetUint8Array,
*   arrowSchema,
*   parquetRowGroupMeta
* );
* const arrowJsTable = tableFromIPC(arrowWasmBatch.intoIPCStream());
* // This table will only have one batch
* const arrowJsRecordBatch = arrowJsTable.batches[0];
* ```
*
* Note that you can get the number of row groups in a Parquet file using {@linkcode FileMetaData.numRowGroups}
*
* @param parquet_file Uint8Array containing Parquet data
* @param schema Use {@linkcode FileMetaData.arrowSchema} to create.
* @param meta {@linkcode RowGroupMetaData} from a call to {@linkcode readMetadata}
* @param {Uint8Array} parquet_file
* @param {ArrowSchema} schema
* @param {RowGroupMetaData} meta
* @returns {RecordBatch}
*/
export function readRowGroup(parquet_file, schema, meta) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(parquet_file, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(schema, ArrowSchema);
        _assertClass(meta, RowGroupMetaData);
        wasm.readRowGroup(retptr, ptr0, len0, schema.__wbg_ptr, meta.__wbg_ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
            throw takeObject(r1);
        }
        return RecordBatch.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
* Asynchronously read metadata from a Parquet file using the
* [`arrow2`](https://crates.io/crates/arrow2) and [`parquet2`](https://crates.io/crates/parquet2)
* Rust crates.
*
* For now, this requires knowing the content length of the file, but hopefully this will be
* relaxed in the future. If you don't know the contentLength of the file, this will perform a
* HEAD request to do so.
*
* Example:
*
* ```js
* // Edit the `parquet-wasm` import as necessary
* import { readMetadataAsync } from "parquet-wasm";
*
* const parquetFileMetaData = await readMetadataAsync(url, contentLength);
* ```
*
* @param url String location of remote Parquet file containing Parquet data
* @param content_length Number content length of file in bytes
* @returns a {@linkcode FileMetaData} object containing metadata of the Parquet file.
* @param {string} url
* @param {number | undefined} content_length
* @returns {Promise<FileMetaData>}
*/
export function readMetadataAsync(url, content_length) {
    const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readMetadataAsync(ptr0, len0, !isLikeNone(content_length), isLikeNone(content_length) ? 0 : content_length);
    return takeObject(ret);
}

/**
* Asynchronously read a single row group from a Parquet file into Arrow data using the
* [`arrow2`](https://crates.io/crates/arrow2) and [`parquet2`](https://crates.io/crates/parquet2)
* Rust crates.
*
* Example:
*
* ```ts
* import * as arrowJs from "apache-arrow";
* // Edit the `parquet-wasm` import as necessary
* import {
*   readRowGroupAsync,
*   readMetadataAsync,
*   RecordBatch,
* } from "parquet-wasm/node/arrow2";
*
* const url = "https://example.com/file.parquet";
* const headResp = await fetch(url, { method: "HEAD" });
* const length = parseInt(headResp.headers.get("Content-Length"));
*
* const parquetFileMetaData = await readMetadataAsync(url, length);
* const arrowSchema = parquetFileMetaData.arrowSchema();
*
* // Read all batches from the file in parallel
* const promises: Promise<RecordBatch>[] = [];
* for (let i = 0; i < parquetFileMetaData.numRowGroups(); i++) {
*   const rowGroupMeta = parquetFileMetaData.rowGroup(i);
*   const rowGroupPromise = readRowGroupAsync(url, rowGroupMeta, arrowSchema);
*   promises.push(rowGroupPromise);
* }
*
* // Collect the per-batch requests
* const wasmRecordBatchChunks = await Promise.all(promises);
*
* // Parse the wasm record batches into JS record batches
* const jsRecordBatchChunks: arrowJs.RecordBatch[] = [];
* for (const wasmRecordBatch of wasmRecordBatchChunks) {
*   const arrowJsTable = arrowJs.tableFromIPC(wasmRecordBatch.intoIPCStream());
*   // This should never throw
*   if (arrowJsTable.batches.length > 1) throw new Error();
*   const arrowJsRecordBatch = arrowJsTable.batches[0];
*   jsRecordBatchChunks.push(arrowJsRecordBatch);
* }
*
* // Concatenate the JS record batches into a table
* const jsTable = new arrowJs.Table(recordBatchChunks);
* ```
*
* Note that you can get the number of row groups in a Parquet file using {@linkcode FileMetaData.numRowGroups}
*
* @param url String location of remote Parquet file containing Parquet data
* @param schema Use {@linkcode FileMetaData.arrowSchema} to create.
* @param meta {@linkcode RowGroupMetaData} from a call to {@linkcode readMetadataAsync}
* @param {string} url
* @param {RowGroupMetaData} row_group_meta
* @param {ArrowSchema} arrow_schema
* @returns {Promise<RecordBatch>}
*/
export function readRowGroupAsync(url, row_group_meta, arrow_schema) {
    const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(row_group_meta, RowGroupMetaData);
    _assertClass(arrow_schema, ArrowSchema);
    const ret = wasm.readRowGroupAsync(ptr0, len0, row_group_meta.__wbg_ptr, arrow_schema.__wbg_ptr);
    return takeObject(ret);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
* Write Arrow data to a Parquet file using the [`arrow2`](https://crates.io/crates/arrow2) and
* [`parquet2`](https://crates.io/crates/parquet2) Rust crates.
*
* For example, to create a Parquet file with Snappy compression:
*
* ```js
* import { tableToIPC } from "apache-arrow";
* // Edit the `parquet-wasm` import as necessary
* import {
*   Table,
*   WriterPropertiesBuilder,
*   Compression,
*   writeParquet,
* } from "parquet-wasm/node/arrow2";
*
* // Given an existing arrow JS table under `table`
* const wasmTable = Table.fromIPCStream(tableToIPC(table, "stream"));
* const writerProperties = new WriterPropertiesBuilder()
*   .setCompression(Compression.SNAPPY)
*   .build();
* const parquetUint8Array = writeParquet(wasmTable, writerProperties);
* ```
*
* If `writerProperties` is not provided or is `null`, the default writer properties will be used.
* This is equivalent to `new WriterPropertiesBuilder().build()`.
*
* @param table A {@linkcode Table} representation in WebAssembly memory.
* @param writer_properties (optional) Configuration for writing to Parquet. Use the {@linkcode
*   WriterPropertiesBuilder} to build a writing configuration, then call `.build()` to create an
*   immutable writer properties to pass in here.
* @returns Uint8Array containing written Parquet data.
* @param {Table} table
* @param {WriterProperties | undefined} writer_properties
* @returns {Uint8Array}
*/
export function writeParquet(table, writer_properties) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        _assertClass(table, Table);
        var ptr0 = table.__destroy_into_raw();
        let ptr1 = 0;
        if (!isLikeNone(writer_properties)) {
            _assertClass(writer_properties, WriterProperties);
            ptr1 = writer_properties.__destroy_into_raw();
        }
        wasm.writeParquet(retptr, ptr0, ptr1);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        var r3 = getInt32Memory0()[retptr / 4 + 3];
        if (r3) {
            throw takeObject(r2);
        }
        var v3 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
* @param {string} url
* @returns {Promise<ReadableStream>}
*/
export function readParquetStream(url) {
    const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readParquetStream(ptr0, len0);
    return takeObject(ret);
}

/**
* Returns a handle to this wasm instance's `WebAssembly.Memory`
* @returns {any}
*/
export function wasmMemory() {
    const ret = wasm.wasmMemory();
    return takeObject(ret);
}

/**
* Returns a handle to this wasm instance's `WebAssembly.Table` which is the indirect function
* table used by Rust
* @returns {any}
*/
export function _functionTable() {
    const ret = wasm._functionTable();
    return takeObject(ret);
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_exn_store(addHeapObject(e));
    }
}
function __wbg_adapter_219(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures__invoke2_mut__h15381a9fe4495194(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

/**
* Supported compression algorithms.
*
* Codecs added in format version X.Y can be read by readers based on X.Y and later.
* Codec support may vary between readers based on the format version and
* libraries available at runtime.
*/
export const Compression = Object.freeze({ UNCOMPRESSED:0,"0":"UNCOMPRESSED",SNAPPY:1,"1":"SNAPPY",GZIP:2,"2":"GZIP",BROTLI:3,"3":"BROTLI",
/**
* @deprecated as of Parquet 2.9.0.
* Switch to LZ4_RAW
*/
LZ4:4,"4":"LZ4",ZSTD:5,"5":"ZSTD",LZ4_RAW:6,"6":"LZ4_RAW", });
/**
* Encodings supported by Parquet.
* Not all encodings are valid for all types. These enums are also used to specify the
* encoding of definition and repetition levels.
*/
export const Encoding = Object.freeze({
/**
* Default byte encoding.
* - BOOLEAN - 1 bit per value, 0 is false; 1 is true.
* - INT32 - 4 bytes per value, stored as little-endian.
* - INT64 - 8 bytes per value, stored as little-endian.
* - FLOAT - 4 bytes per value, stored as little-endian.
* - DOUBLE - 8 bytes per value, stored as little-endian.
* - BYTE_ARRAY - 4 byte length stored as little endian, followed by bytes.
* - FIXED_LEN_BYTE_ARRAY - just the bytes are stored.
*/
PLAIN:0,"0":"PLAIN",
/**
* **Deprecated** dictionary encoding.
*
* The values in the dictionary are encoded using PLAIN encoding.
* Since it is deprecated, RLE_DICTIONARY encoding is used for a data page, and
* PLAIN encoding is used for dictionary page.
*/
PLAIN_DICTIONARY:1,"1":"PLAIN_DICTIONARY",
/**
* Group packed run length encoding.
*
* Usable for definition/repetition levels encoding and boolean values.
*/
RLE:2,"2":"RLE",
/**
* Bit packed encoding.
*
* This can only be used if the data has a known max width.
* Usable for definition/repetition levels encoding.
*/
BIT_PACKED:3,"3":"BIT_PACKED",
/**
* Delta encoding for integers, either INT32 or INT64.
*
* Works best on sorted data.
*/
DELTA_BINARY_PACKED:4,"4":"DELTA_BINARY_PACKED",
/**
* Encoding for byte arrays to separate the length values and the data.
*
* The lengths are encoded using DELTA_BINARY_PACKED encoding.
*/
DELTA_LENGTH_BYTE_ARRAY:5,"5":"DELTA_LENGTH_BYTE_ARRAY",
/**
* Incremental encoding for byte arrays.
*
* Prefix lengths are encoded using DELTA_BINARY_PACKED encoding.
* Suffixes are stored using DELTA_LENGTH_BYTE_ARRAY encoding.
*/
DELTA_BYTE_ARRAY:6,"6":"DELTA_BYTE_ARRAY",
/**
* Dictionary encoding.
*
* The ids are encoded using the RLE encoding.
*/
RLE_DICTIONARY:7,"7":"RLE_DICTIONARY",
/**
* Encoding for floating-point data.
*
* K byte-streams are created where K is the size in bytes of the data type.
* The individual bytes of an FP value are scattered to the corresponding stream and
* the streams are concatenated.
* This itself does not reduce the size of the data but can lead to better compression
* afterwards.
*/
BYTE_STREAM_SPLIT:8,"8":"BYTE_STREAM_SPLIT", });
/**
* The Parquet version to use when writing
*/
export const WriterVersion = Object.freeze({ V1:0,"0":"V1",V2:1,"1":"V2", });
/**
* Arrow Schema representing a Parquet file.
*/
export class ArrowSchema {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ArrowSchema.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_arrowschema_free(ptr);
    }
    /**
    * Clone this struct in wasm memory.
    * @returns {ArrowSchema}
    */
    copy() {
        const ret = wasm.arrowschema_copy(this.__wbg_ptr);
        return ArrowSchema.__wrap(ret);
    }
}
/**
* Metadata for a column chunk.
*/
export class ColumnChunkMetaData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ColumnChunkMetaData.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_columnchunkmetadata_free(ptr);
    }
    /**
    * File where the column chunk is stored.
    *
    * If not set, assumed to belong to the same file as the metadata.
    * This path is relative to the current file.
    * @returns {string | undefined}
    */
    filePath() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_filePath(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Byte offset in `file_path()`.
    * @returns {bigint}
    */
    fileOffset() {
        const ret = wasm.columnchunkmetadata_fileOffset(this.__wbg_ptr);
        return ret;
    }
    /**
    * @returns {string}
    */
    pathInSchema() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_pathInSchema(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * @returns {boolean}
    */
    statistics_exist() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_statistics_exist(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getStatisticsMinValue() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_getStatisticsMinValue(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getStatisticsMaxValue() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_getStatisticsMaxValue(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getStatisticsNullCount() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_getStatisticsNullCount(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Total number of values in this column chunk. Note that this is not necessarily the number
    * of rows. E.g. the (nested) array `[[1, 2], [3]]` has 2 rows and 3 values.
    * @returns {bigint}
    */
    numValues() {
        const ret = wasm.columnchunkmetadata_numValues(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns the total compressed data size of this column chunk.
    * @returns {bigint}
    */
    compressedSize() {
        const ret = wasm.columnchunkmetadata_compressedSize(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns the total uncompressed data size of this column chunk.
    * @returns {bigint}
    */
    uncompressedSize() {
        const ret = wasm.columnchunkmetadata_uncompressedSize(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns the offset for the column data.
    * @returns {bigint}
    */
    dataPageOffset() {
        const ret = wasm.columnchunkmetadata_dataPageOffset(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns `true` if this column chunk contains a index page, `false` otherwise.
    * @returns {boolean}
    */
    hasIndexPage() {
        const ret = wasm.columnchunkmetadata_hasIndexPage(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * Returns the offset for the index page.
    * @returns {bigint | undefined}
    */
    indexPageOffset() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_indexPageOffset(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r2 = getBigInt64Memory0()[retptr / 8 + 1];
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns the offset for the dictionary page, if any.
    * @returns {bigint | undefined}
    */
    dictionaryPageOffset() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_dictionaryPageOffset(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r2 = getBigInt64Memory0()[retptr / 8 + 1];
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns the number of encodings for this column
    * @returns {number}
    */
    numColumnEncodings() {
        const ret = wasm.columnchunkmetadata_numColumnEncodings(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Returns the offset and length in bytes of the column chunk within the file
    * @returns {BigUint64Array}
    */
    byteRange() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.columnchunkmetadata_byteRange(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
/**
* The set of supported logical types in this crate.
*/
export class DataType {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DataType.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_datatype_free(ptr);
    }
}
/**
* A representation of an Arrow RecordBatch in WebAssembly memory exposed as FFI-compatible
* structs through the Arrow C Data Interface.
*/
export class FFIRecordBatch {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(FFIRecordBatch.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ffirecordbatch_free(ptr);
    }
    /**
    * Access the pointer to the
    * [`ArrowArray`](https://arrow.apache.org/docs/format/CDataInterface.html#structure-definitions)
    * struct. This can be viewed or copied (without serialization) to an Arrow JS `RecordBatch` by
    * using [`arrow-js-ffi`](https://github.com/kylebarron/arrow-js-ffi). You can access the
    * [`WebAssembly.Memory`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
    * instance by using {@linkcode wasmMemory}.
    *
    * **Example**:
    *
    * ```ts
    * import { parseRecordBatch } from "arrow-js-ffi";
    *
    * const wasmRecordBatch: FFIRecordBatch = ...
    * const wasmMemory: WebAssembly.Memory = wasmMemory();
    *
    * // Pass `true` to copy arrays across the boundary instead of creating views.
    * const jsRecordBatch = parseRecordBatch(
    *   wasmMemory.buffer,
    *   wasmRecordBatch.arrayAddr(),
    *   wasmRecordBatch.schemaAddr(),
    *   true
    * );
    * ```
    * @returns {number}
    */
    arrayAddr() {
        const ret = wasm.ffirecordbatch_arrayAddr(this.__wbg_ptr);
        return ret;
    }
    /**
    * Access the pointer to the
    * [`ArrowSchema`](https://arrow.apache.org/docs/format/CDataInterface.html#structure-definitions)
    * struct. This can be viewed or copied (without serialization) to an Arrow JS `Field` by
    * using [`arrow-js-ffi`](https://github.com/kylebarron/arrow-js-ffi). You can access the
    * [`WebAssembly.Memory`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
    * instance by using {@linkcode wasmMemory}.
    *
    * **Example**:
    *
    * ```ts
    * import { parseRecordBatch } from "arrow-js-ffi";
    *
    * const wasmRecordBatch: FFIRecordBatch = ...
    * const wasmMemory: WebAssembly.Memory = wasmMemory();
    *
    * // Pass `true` to copy arrays across the boundary instead of creating views.
    * const jsRecordBatch = parseRecordBatch(
    *   wasmMemory.buffer,
    *   wasmRecordBatch.arrayAddr(),
    *   wasmRecordBatch.schemaAddr(),
    *   true
    * );
    * ```
    * @returns {number}
    */
    schemaAddr() {
        const ret = wasm.ffirecordbatch_schemaAddr(this.__wbg_ptr);
        return ret;
    }
}
/**
* A representation of an Arrow Table in WebAssembly memory exposed as FFI-compatible
* structs through the Arrow C Data Interface.
*/
export class FFITable {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(FFITable.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ffitable_free(ptr);
    }
    /**
    * Get the total number of record batches in the table
    * @returns {number}
    */
    numBatches() {
        const ret = wasm.ffitable_numBatches(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Get the pointer to one ArrowSchema FFI struct
    * @returns {number}
    */
    schemaAddr() {
        const ret = wasm.ffitable_schemaAddr(this.__wbg_ptr);
        return ret;
    }
    /**
    * Get the pointer to one ArrowArray FFI struct for a given chunk index and column index
    *
    * Access the pointer to one
    * [`ArrowArray`](https://arrow.apache.org/docs/format/CDataInterface.html#structure-definitions)
    * struct representing one of the internal `RecordBatch`es. This can be viewed or copied (without serialization) to an Arrow JS `RecordBatch` by
    * using [`arrow-js-ffi`](https://github.com/kylebarron/arrow-js-ffi). You can access the
    * [`WebAssembly.Memory`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
    * instance by using {@linkcode wasmMemory}.
    *
    * **Example**:
    *
    * ```ts
    * import * as arrow from "apache-arrow";
    * import { parseRecordBatch } from "arrow-js-ffi";
    *
    * const wasmTable: FFITable = ...
    * const wasmMemory: WebAssembly.Memory = wasmMemory();
    *
    * const jsBatches: arrow.RecordBatch[] = []
    * for (let i = 0; i < wasmTable.numBatches(); i++) {
    *   // Pass `true` to copy arrays across the boundary instead of creating views.
    *   const jsRecordBatch = parseRecordBatch(
    *     wasmMemory.buffer,
    *     wasmTable.arrayAddr(i),
    *     wasmTable.schemaAddr(),
    *     true
    *   );
    *   jsBatches.push(jsRecordBatch);
    * }
    * const jsTable = new arrow.Table(jsBatches);
    * ```
    *
    * @param chunk number The chunk index to use
    * @returns number pointer to an ArrowArray FFI struct in Wasm memory
    * @param {number} chunk
    * @returns {number}
    */
    arrayAddr(chunk) {
        const ret = wasm.ffitable_arrayAddr(this.__wbg_ptr, chunk);
        return ret;
    }
    /**
    */
    drop() {
        const ptr = this.__destroy_into_raw();
        wasm.ffitable_drop(ptr);
    }
}
/**
*/
export class FFIVector {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ffivector_free(ptr);
    }
    /**
    * @returns {number}
    */
    array_addr() {
        const ret = wasm.ffivector_array_addr(this.__wbg_ptr);
        return ret;
    }
    /**
    * @returns {number}
    */
    field_addr() {
        const ret = wasm.ffivector_field_addr(this.__wbg_ptr);
        return ret;
    }
}
/**
* Metadata for a Parquet file.
*/
export class FileMetaData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(FileMetaData.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_filemetadata_free(ptr);
    }
    /**
    * Clone this struct in wasm memory.
    * @returns {FileMetaData}
    */
    copy() {
        const ret = wasm.filemetadata_copy(this.__wbg_ptr);
        return FileMetaData.__wrap(ret);
    }
    /**
    * Version of this file.
    * @returns {number}
    */
    version() {
        const ret = wasm.filemetadata_version(this.__wbg_ptr);
        return ret;
    }
    /**
    * number of rows in the file.
    * @returns {number}
    */
    numRows() {
        const ret = wasm.filemetadata_numRows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * String message for application that wrote this file.
    * @returns {string | undefined}
    */
    createdBy() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.filemetadata_createdBy(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Number of row groups in the file
    * @returns {number}
    */
    numRowGroups() {
        const ret = wasm.filemetadata_numRowGroups(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Returns a single RowGroupMetaData by index
    * @param {number} i
    * @returns {RowGroupMetaData}
    */
    rowGroup(i) {
        const ret = wasm.filemetadata_rowGroup(this.__wbg_ptr, i);
        return RowGroupMetaData.__wrap(ret);
    }
    /**
    * @returns {SchemaDescriptor}
    */
    schema() {
        const ret = wasm.filemetadata_schema(this.__wbg_ptr);
        return SchemaDescriptor.__wrap(ret);
    }
    /**
    * @returns {any}
    */
    keyValueMetadata() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.filemetadata_keyValueMetadata(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {ArrowSchema}
    */
    arrowSchema() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.filemetadata_arrowSchema(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return ArrowSchema.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
/**
*/
export class IntoUnderlyingByteSource {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr);
    }
    /**
    * @returns {string}
    */
    get type() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.intounderlyingbytesource_type(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * @returns {number}
    */
    get autoAllocateChunkSize() {
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * @param {any} controller
    */
    start(controller) {
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, addHeapObject(controller));
    }
    /**
    * @param {any} controller
    * @returns {Promise<any>}
    */
    pull(controller) {
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
    /**
    */
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr);
    }
}
/**
*/
export class IntoUnderlyingSink {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr);
    }
    /**
    * @param {any} chunk
    * @returns {Promise<any>}
    */
    write(chunk) {
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, addHeapObject(chunk));
        return takeObject(ret);
    }
    /**
    * @returns {Promise<any>}
    */
    close() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_close(ptr);
        return takeObject(ret);
    }
    /**
    * @param {any} reason
    * @returns {Promise<any>}
    */
    abort(reason) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_abort(ptr, addHeapObject(reason));
        return takeObject(ret);
    }
}
/**
*/
export class IntoUnderlyingSource {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IntoUnderlyingSource.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr);
    }
    /**
    * @param {any} controller
    * @returns {Promise<any>}
    */
    pull(controller) {
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
    /**
    */
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingsource_cancel(ptr);
    }
}
/**
* Raw options for [`pipeTo()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeTo).
*/
export class PipeOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pipeoptions_free(ptr);
    }
    /**
    * @returns {boolean}
    */
    get preventClose() {
        const ret = wasm.pipeoptions_preventClose(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * @returns {boolean}
    */
    get preventCancel() {
        const ret = wasm.pipeoptions_preventCancel(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * @returns {boolean}
    */
    get preventAbort() {
        const ret = wasm.pipeoptions_preventAbort(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * @returns {AbortSignal | undefined}
    */
    get signal() {
        const ret = wasm.pipeoptions_signal(this.__wbg_ptr);
        return takeObject(ret);
    }
}
/**
*/
export class QueuingStrategy {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(QueuingStrategy.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_queuingstrategy_free(ptr);
    }
    /**
    * @returns {number}
    */
    get highWaterMark() {
        const ret = wasm.queuingstrategy_highWaterMark(this.__wbg_ptr);
        return ret;
    }
}
/**
* Raw options for [`getReader()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader).
*/
export class ReadableStreamGetReaderOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_readablestreamgetreaderoptions_free(ptr);
    }
    /**
    * @returns {any}
    */
    get mode() {
        const ret = wasm.readablestreamgetreaderoptions_mode(this.__wbg_ptr);
        return takeObject(ret);
    }
}
/**
* A group of columns of equal length in WebAssembly memory with an associated {@linkcode Schema}.
*/
export class RecordBatch {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RecordBatch.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_recordbatch_free(ptr);
    }
    /**
    * The number of rows in this RecordBatch
    * @returns {number}
    */
    get numRows() {
        const ret = wasm.recordbatch_numRows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * The number of columns in this RecordBatch
    * @returns {number}
    */
    get numColumns() {
        const ret = wasm.recordbatch_numColumns(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * The {@linkcode Schema} of this RecordBatch.
    * @returns {Schema}
    */
    get schema() {
        const ret = wasm.recordbatch_schema(this.__wbg_ptr);
        return Schema.__wrap(ret);
    }
    /**
    * Get a column's vector by index.
    * @param {number} index
    * @returns {Vector | undefined}
    */
    column(index) {
        const ret = wasm.recordbatch_column(this.__wbg_ptr, index);
        return ret === 0 ? undefined : Vector.__wrap(ret);
    }
    /**
    * Get a column's vector by name
    * @param {string} name
    * @returns {Vector | undefined}
    */
    column_by_name(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.recordbatch_column_by_name(this.__wbg_ptr, ptr0, len0);
        return ret === 0 ? undefined : Vector.__wrap(ret);
    }
    /**
    * Export this RecordBatch to FFI structs according to the Arrow C Data Interface.
    *
    * This method **does not consume** the RecordBatch, so you must remember to call {@linkcode
    * RecordBatch.free} to release the resources. The underlying arrays are reference counted, so
    * this method does not copy data, it only prevents the data from being released.
    * @returns {FFIRecordBatch}
    */
    toFFI() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recordbatch_toFFI(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return FFIRecordBatch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Export this RecordBatch to FFI structs according to the Arrow C Data Interface.
    *
    * This method **does consume** the RecordBatch, so the original RecordBatch will be
    * inaccessible after this call. You must still call {@linkcode FFIRecordBatch.free} after
    * you've finished using the FFI table.
    * @returns {FFIRecordBatch}
    */
    intoFFI() {
        try {
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recordbatch_intoFFI(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return FFIRecordBatch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Consume this RecordBatch and convert to an Arrow IPC Stream buffer
    * @returns {Uint8Array}
    */
    intoIPCStream() {
        try {
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recordbatch_intoIPCStream(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            var r3 = getInt32Memory0()[retptr / 4 + 3];
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
/**
* Metadata for a row group.
*/
export class RowGroupMetaData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RowGroupMetaData.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rowgroupmetadata_free(ptr);
    }
    /**
    * Number of rows in this row group.
    * @returns {number}
    */
    numRows() {
        const ret = wasm.rowgroupmetadata_numRows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Number of columns in this row group.
    * @returns {number}
    */
    numColumns() {
        const ret = wasm.rowgroupmetadata_numColumns(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Returns a single column chunk metadata by index
    * @param {number} i
    * @returns {ColumnChunkMetaData}
    */
    column(i) {
        const ret = wasm.rowgroupmetadata_column(this.__wbg_ptr, i);
        return ColumnChunkMetaData.__wrap(ret);
    }
    /**
    * Total byte size of all uncompressed column data in this row group.
    * @returns {number}
    */
    totalByteSize() {
        const ret = wasm.rowgroupmetadata_totalByteSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Total size of all compressed column data in this row group.
    * @returns {number}
    */
    compressedSize() {
        const ret = wasm.rowgroupmetadata_compressedSize(this.__wbg_ptr);
        return ret >>> 0;
    }
}
/**
* A named collection of types that defines the column names and types in a RecordBatch or Table
* data structure.
*
* A Schema can also contain extra user-defined metadata either at the Table or Column level.
* Column-level metadata is often used to define [extension
* types](https://arrow.apache.org/docs/format/Columnar.html#extension-types).
*/
export class Schema {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Schema.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_schema_free(ptr);
    }
}
/**
* A schema descriptor. This encapsulates the top-level schemas for all the columns,
* as well as all descriptors for all the primitive columns.
*/
export class SchemaDescriptor {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SchemaDescriptor.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_schemadescriptor_free(ptr);
    }
    /**
    * The schemas' name.
    * @returns {string}
    */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.schemadescriptor_name(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * The number of columns in the schema
    * @returns {number}
    */
    numColumns() {
        const ret = wasm.schemadescriptor_numColumns(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * The number of fields in the schema
    * @returns {number}
    */
    numFields() {
        const ret = wasm.schemadescriptor_numFields(this.__wbg_ptr);
        return ret >>> 0;
    }
}
/**
* A Table in WebAssembly memory conforming to the Apache Arrow spec.
*
* A Table consists of one or more {@linkcode RecordBatch} objects plus a {@linkcode Schema} that
* each RecordBatch conforms to.
*/
export class Table {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Table.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_table_free(ptr);
    }
    /**
    * Access the Table's {@linkcode Schema}.
    * @returns {Schema}
    */
    get schema() {
        const ret = wasm.table_schema(this.__wbg_ptr);
        return Schema.__wrap(ret);
    }
    /**
    * Access a RecordBatch from the Table by index.
    *
    * @param index The positional index of the RecordBatch to retrieve.
    * @returns a RecordBatch or `null` if out of range.
    * @param {number} index
    * @returns {RecordBatch | undefined}
    */
    recordBatch(index) {
        const ret = wasm.table_recordBatch(this.__wbg_ptr, index);
        return ret === 0 ? undefined : RecordBatch.__wrap(ret);
    }
    /**
    * The number of batches in the Table
    * @returns {number}
    */
    get numBatches() {
        const ret = wasm.table_numBatches(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * Export this Table to FFI structs according to the Arrow C Data Interface.
    *
    * This method **does not consume** the Table, so you must remember to call {@linkcode
    * Table.free} to release the resources. The underlying arrays are reference counted, so
    * this method does not copy data, it only prevents the data from being released.
    * @returns {FFITable}
    */
    toFFI() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.table_toFFI(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return FFITable.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Export this Table to FFI structs according to the Arrow C Data Interface.
    *
    * This method **does consume** the Table, so the original Table will be
    * inaccessible after this call. You must still call {@linkcode FFITable.free} after
    * you've finished using the FFITable.
    * @returns {FFITable}
    */
    intoFFI() {
        try {
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.table_intoFFI(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return FFITable.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Consume this table and convert to an Arrow IPC Stream buffer
    * @returns {Uint8Array}
    */
    intoIPCStream() {
        try {
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.table_intoIPCStream(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            var r3 = getInt32Memory0()[retptr / 4 + 3];
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Create a table from an Arrow IPC File buffer
    * @param {Uint8Array} buf
    * @returns {Table}
    */
    static fromIPCFile(buf) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(buf, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.table_fromIPCFile(retptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return Table.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Create a table from an Arrow IPC Stream buffer
    * @param {Uint8Array} buf
    * @returns {Table}
    */
    static fromIPCStream(buf) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(buf, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.table_fromIPCStream(retptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return Table.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
/**
* An Arrow vector of unknown type that is guaranteed to have contiguous memory (i.e. cannot be
* chunked).
*/
export class Vector {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Vector.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_vector_free(ptr);
    }
    /**
    * The data type of this vector
    * @returns {DataType}
    */
    data_type() {
        const ret = wasm.vector_data_type(this.__wbg_ptr);
        return DataType.__wrap(ret);
    }
}
/**
* Immutable struct to hold writing configuration for `writeParquet2`.
*
* Use {@linkcode WriterPropertiesBuilder} to create a configuration, then call {@linkcode
* WriterPropertiesBuilder.build} to create an instance of `WriterProperties`.
*/
export class WriterProperties {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WriterProperties.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_writerproperties_free(ptr);
    }
}
/**
* Builder to create a writing configuration for `writeParquet2`
*
* Call {@linkcode build} on the finished builder to create an immputable {@linkcode WriterProperties} to pass to `writeParquet2`
*/
export class WriterPropertiesBuilder {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WriterPropertiesBuilder.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_writerpropertiesbuilder_free(ptr);
    }
    /**
    * Returns default state of the builder.
    */
    constructor() {
        const ret = wasm.writerpropertiesbuilder_new();
        return WriterPropertiesBuilder.__wrap(ret);
    }
    /**
    * Finalizes the configuration and returns immutable writer properties struct.
    * @returns {WriterProperties}
    */
    build() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.writerpropertiesbuilder_build(ptr);
        return WriterProperties.__wrap(ret);
    }
    /**
    * Sets writer version.
    * @param {number} value
    * @returns {WriterPropertiesBuilder}
    */
    setWriterVersion(value) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.writerpropertiesbuilder_setWriterVersion(ptr, value);
        return WriterPropertiesBuilder.__wrap(ret);
    }
    /**
    * Sets encoding for any column.
    *
    * If dictionary is not enabled, this is treated as a primary encoding for all
    * columns. In case when dictionary is enabled for any column, this value is
    * considered to be a fallback encoding for that column.
    *
    * Panics if user tries to set dictionary encoding here, regardless of dictionary
    * encoding flag being set.
    * @param {number} value
    * @returns {WriterPropertiesBuilder}
    */
    setEncoding(value) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.writerpropertiesbuilder_setEncoding(ptr, value);
        return WriterPropertiesBuilder.__wrap(ret);
    }
    /**
    * Sets compression codec for any column.
    * @param {number} value
    * @returns {WriterPropertiesBuilder}
    */
    setCompression(value) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.writerpropertiesbuilder_setCompression(ptr, value);
        return WriterPropertiesBuilder.__wrap(ret);
    }
    /**
    * Sets flag to enable/disable statistics for any column.
    * @param {boolean} value
    * @returns {WriterPropertiesBuilder}
    */
    setStatisticsEnabled(value) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.writerpropertiesbuilder_setStatisticsEnabled(ptr, value);
        return WriterPropertiesBuilder.__wrap(ret);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_filemetadata_new = function(arg0) {
        const ret = FileMetaData.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_number_new = function(arg0) {
        const ret = arg0;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_bigint_from_i64 = function(arg0) {
        const ret = arg0;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_fetch_b5d6bebed1e6c2d2 = function(arg0) {
        const ret = fetch(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newwithsource_620c192b0682807b = function(arg0, arg1) {
        const ret = new ReadableStream(IntoUnderlyingSource.__wrap(arg0), QueuingStrategy.__wrap(arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_close_e9110ca16e2567db = function(arg0) {
        getObject(arg0).close();
    };
    imports.wbg.__wbg_enqueue_d71a1a518e21f5c3 = function(arg0, arg1) {
        getObject(arg0).enqueue(getObject(arg1));
    };
    imports.wbg.__wbg_byobRequest_08c18cee35def1f4 = function(arg0) {
        const ret = getObject(arg0).byobRequest;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_close_da7e6fb9d9851e5a = function(arg0) {
        getObject(arg0).close();
    };
    imports.wbg.__wbg_view_231340b0dd8a2484 = function(arg0) {
        const ret = getObject(arg0).view;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_respond_8fadc5f5c9d95422 = function(arg0, arg1) {
        getObject(arg0).respond(arg1 >>> 0);
    };
    imports.wbg.__wbg_buffer_4e79326814bdd393 = function(arg0) {
        const ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_byteOffset_b69b0a07afccce19 = function(arg0) {
        const ret = getObject(arg0).byteOffset;
        return ret;
    };
    imports.wbg.__wbg_byteLength_5299848ed3264181 = function(arg0) {
        const ret = getObject(arg0).byteLength;
        return ret;
    };
    imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = getObject(arg0);
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbg_String_4370c5505c674d30 = function(arg0, arg1) {
        const ret = String(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_set_bd72c078edfa51ad = function(arg0, arg1, arg2) {
        getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    };
    imports.wbg.__wbindgen_cb_drop = function(arg0) {
        const obj = takeObject(arg0).original;
        if (obj.cnt-- == 1) {
            obj.a = 0;
            return true;
        }
        const ret = false;
        return ret;
    };
    imports.wbg.__wbg_recordbatch_new = function(arg0) {
        const ret = RecordBatch.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_crypto_c48a774b022d20ac = function(arg0) {
        const ret = getObject(arg0).crypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_process_298734cf255a885d = function(arg0) {
        const ret = getObject(arg0).process;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_versions_e2e78e134e3e5d01 = function(arg0) {
        const ret = getObject(arg0).versions;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_node_1cd7a5d853dbea79 = function(arg0) {
        const ret = getObject(arg0).node;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(getObject(arg0)) === 'string';
        return ret;
    };
    imports.wbg.__wbg_require_8f08ceecec0f4fee = function() { return handleError(function () {
        const ret = module.require;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_msCrypto_bcb970640f50a1e8 = function(arg0) {
        const ret = getObject(arg0).msCrypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_randomFillSync_dc1e9a60c158336d = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).randomFillSync(takeObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_getRandomValues_37fa2ca9e4e07fab = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).getRandomValues(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_fetch_8eaf01857a5bb21f = function(arg0, arg1) {
        const ret = getObject(arg0).fetch(getObject(arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_signal_4bd18fb489af2d4c = function(arg0) {
        const ret = getObject(arg0).signal;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_55c9955722952374 = function() { return handleError(function () {
        const ret = new AbortController();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_abort_654b796176d117aa = function(arg0) {
        getObject(arg0).abort();
    };
    imports.wbg.__wbg_new_1eead62f64ca15ce = function() { return handleError(function () {
        const ret = new Headers();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_append_fda9e3432e3e88da = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments) };
    imports.wbg.__wbg_newwithstrandinit_cad5cd6038c7ff5d = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_instanceof_Response_fc4327dbfcdf5ced = function(arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Response;
        } catch {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_url_8503de97f69da463 = function(arg0, arg1) {
        const ret = getObject(arg1).url;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_status_ac85a3142a84caa2 = function(arg0) {
        const ret = getObject(arg0).status;
        return ret;
    };
    imports.wbg.__wbg_headers_b70de86b8e989bc0 = function(arg0) {
        const ret = getObject(arg0).headers;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_arrayBuffer_288fb3538806e85c = function() { return handleError(function (arg0) {
        const ret = getObject(arg0).arrayBuffer();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_is_function = function(arg0) {
        const ret = typeof(getObject(arg0)) === 'function';
        return ret;
    };
    imports.wbg.__wbg_newnoargs_581967eacc0e2604 = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_56693dbed0c32988 = function() {
        const ret = new Map();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_next_526fc47e980da008 = function(arg0) {
        const ret = getObject(arg0).next;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_next_ddb3312ca1c4e32a = function() { return handleError(function (arg0) {
        const ret = getObject(arg0).next();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_done_5c1f01fb660d73b5 = function(arg0) {
        const ret = getObject(arg0).done;
        return ret;
    };
    imports.wbg.__wbg_value_1695675138684bd5 = function(arg0) {
        const ret = getObject(arg0).value;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_iterator_97f0c81209c6c35a = function() {
        const ret = Symbol.iterator;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_get_97b561fb56f034b5 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(getObject(arg0), getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_cb65541d95d71282 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).call(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_b51585de1b234aff = function() {
        const ret = new Object();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_self_1ff1d729e9aae938 = function() { return handleError(function () {
        const ret = self.self;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_window_5f4faef6c12b79ec = function() { return handleError(function () {
        const ret = window.window;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_globalThis_1d39714405582d3c = function() { return handleError(function () {
        const ret = globalThis.globalThis;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_global_651f05c6a0944d1c = function() { return handleError(function () {
        const ret = global.global;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = getObject(arg0) === undefined;
        return ret;
    };
    imports.wbg.__wbg_new_d258248ed531ff54 = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_call_01734de55d61e11d = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_set_bedc3d02d0f05eb0 = function(arg0, arg1, arg2) {
        const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_43f1b47c28813cbd = function(arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return __wbg_adapter_219(a, state0.b, arg0, arg1);
                } finally {
                    state0.a = a;
                }
            };
            const ret = new Promise(cb0);
            return addHeapObject(ret);
        } finally {
            state0.a = state0.b = 0;
        }
    };
    imports.wbg.__wbg_resolve_53698b95aaf7fcf8 = function(arg0) {
        const ret = Promise.resolve(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_then_f7e06ee3c11698eb = function(arg0, arg1) {
        const ret = getObject(arg0).then(getObject(arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_then_b2267541e2a73865 = function(arg0, arg1, arg2) {
        const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_buffer_085ec1f694018c4f = function(arg0) {
        const ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_6da8e527659b86aa = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_8125e318e6245eed = function(arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_5cf90238115182c3 = function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__wbg_length_72e2208bbc0efc61 = function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbg_newwithlength_e5d69174d6984cd7 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_subarray_13db269f57aa838d = function(arg0, arg1, arg2) {
        const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_has_c5fcd020291e56b8 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.has(getObject(arg0), getObject(arg1));
        return ret;
    }, arguments) };
    imports.wbg.__wbg_set_092e06b0f9d71865 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
        return ret;
    }, arguments) };
    imports.wbg.__wbg_stringify_e25465938f3f611f = function() { return handleError(function (arg0) {
        const ret = JSON.stringify(getObject(arg0));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
        const ret = debugString(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_function_table = function() {
        const ret = wasm.__wbindgen_export_2;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_closure_wrapper1463 = function(arg0, arg1, arg2) {
        const ret = makeMutClosure(arg0, arg1, 287, __wbg_adapter_34);
        return addHeapObject(ret);
    };

    return imports;
}

function __wbg_init_memory(imports, maybe_memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedBigInt64Memory0 = null;
    cachedBigUint64Memory0 = null;
    cachedInt32Memory0 = null;
    cachedUint8Memory0 = null;


    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(input) {
    if (wasm !== undefined) return wasm;

    if (typeof input === 'undefined') {
        input = new URL('arrow2_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await input, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync }
export default __wbg_init;

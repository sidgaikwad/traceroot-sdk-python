import { NextRequest, NextResponse } from 'next/server';
import * as traceroot from 'traceroot-sdk-ts';

// Initialize traceroot with robust error handling
let tracerootInitialized = false;
let tracerootLogger: any = null;

async function initializeTraceroot() {
  if (!tracerootInitialized) {
    try {
      await traceroot.init();
      tracerootLogger = traceroot.get_logger();
      tracerootInitialized = true;
      console.log('🚀 Traceroot initialized successfully in API route');
      if (tracerootLogger) {
        tracerootLogger.info('🚀 Traceroot initialized successfully in API route');
      }
    } catch (error) {
      console.error('⚠️ Traceroot initialization failed, continuing without tracing:', error);
      tracerootInitialized = false;
      tracerootLogger = null;
      // Don't throw - continue without traceroot
    }
  }
}

// Create a traced version of the request function
const makeTracedCodeRequest = async (query: string): Promise<any> => {
  try {
    console.log('📡 Making request to code agent:', { query });
    
    // Log with traceroot if available
    if (tracerootLogger) {
      tracerootLogger.info('📡 Making request to code agent', { query });
    }

    // Get trace headers if traceroot is available
    let traceHeaders = {};
    if (tracerootInitialized) {
      try {
        traceHeaders = traceroot.getTraceHeaders();
        const spanInfo = traceroot.getActiveSpanInfo();
        
        console.log('🔗 Trace Context:', {
          headerCount: Object.keys(traceHeaders).length,
          hasSpanInfo: !!spanInfo
        });

        if (tracerootLogger) {
          tracerootLogger.debug('🔗 Trace Context Debug', {
            spanInfo: JSON.stringify(spanInfo),
            traceHeaders: JSON.stringify(traceHeaders),
            headerCount: Object.keys(traceHeaders).length
          });
        }
      } catch (traceError) {
        console.warn('⚠️ Failed to get trace headers, continuing without:', traceError);
      }
    }

    const response = await fetch('http://localhost:9999/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...traceHeaders, // Spread trace headers if available
      },
      body: JSON.stringify({ query }),
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response error:', errorText);
      
      if (tracerootLogger) {
        tracerootLogger.error('❌ Code agent request failed', { 
          status: response.status, 
          error: errorText 
        });
      }
      
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Code agent request completed:', { 
      hasResponse: !!result.response,
      hasError: !!result.error 
    });

    if (tracerootLogger) {
      tracerootLogger.info('✅ Code agent request completed', {
        hasResponse: !!result.response,
        hasError: !!result.error
      });
    }

    return result;
  } catch (error: any) {
    console.error('❌ Code agent request failed:', error.message);
    
    if (tracerootLogger) {
      tracerootLogger.error('❌ Code agent request failed', { error: error.message });
    }
    
    throw error;
  }
};

// Use traceFunction if traceroot is available, otherwise use regular function
function makeCodeRequest(query: string): Promise<any> {
  if (tracerootInitialized) {
    try {
      // Use traceFunction for proper span creation
      const tracedFunction = traceroot.traceFunction(
        makeTracedCodeRequest,
        { spanName: 'code_agent_request' }
      );
      return tracedFunction(query);
    } catch (traceError) {
      console.warn('⚠️ traceFunction failed, falling back to regular function:', traceError);
      return makeTracedCodeRequest(query);
    }
  }
  return makeTracedCodeRequest(query);
}

export async function POST(request: NextRequest) {
  try {
    console.log('🤖 API route called');

    // Initialize traceroot (non-blocking)
    await initializeTraceroot();

    const body = await request.json();
    console.log('📄 Request body:', body);
    
    const { query } = body;

    if (!query) {
      console.log('❌ No query provided');
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    console.log('🤖 Processing code generation request:', { query });
    
    if (tracerootLogger) {
      tracerootLogger.info('🤖 Received code generation request', { query });
    }

    // Make request to the code agent (with tracing if available)
    const result = await makeCodeRequest(query);

    console.log('✅ Returning result');
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('❌ API route error:', error.message, error.stack);
    
    if (tracerootLogger) {
      tracerootLogger.error('❌ API route error', { error: error.message });
    }
    
    return NextResponse.json(
      { error: `Failed to process request: ${error.message}` },
      { status: 500 }
    );
  }
}

// Add a simple GET endpoint for testing
export async function GET() {
  try {
    // Initialize traceroot for status check
    await initializeTraceroot();

    // Test connectivity to the code agent
    const testResponse = await fetch('http://localhost:9999/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'test connection' }),
    });

    return NextResponse.json({ 
      message: 'Code Agent API Proxy with Traceroot',
      status: 'ready',
      tracerootInitialized,
      codeAgentReachable: testResponse.ok,
      codeAgentStatus: testResponse.status
    });
  } catch (error: any) {
    return NextResponse.json({ 
      message: 'Code Agent API Proxy with Traceroot',
      status: 'error',
      error: error.message,
      tracerootInitialized,
      codeAgentReachable: false
    });
  }
}
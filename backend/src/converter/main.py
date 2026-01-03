import re
from typing import Dict, List, Union

def convert_cpp_to_python(code: str) -> Dict[str, Union[str, List[str]]]:
    """
    Convert C++ code to Python code.
    
    CRITICAL: Preserve the EXACT leading whitespace from EVERY original line
    so that the converted code aligns perfectly with GitHub's rendering.
    We do NOT recalculate indentation - we use whatever the original had.

    @args: code: str - C++ code as a string
    @returns: Dict with full string and per-line list
    """
    lines = code.split('\n')
    result = []
    
    for line in lines:
        # Get the EXACT original leading whitespace - this is key!
        original_leading_ws = get_leading_whitespace(line)
        stripped = line.strip()
        
        # Preserve empty lines exactly
        if not stripped:
            result.append('')
            continue
        
        # Convert C++ single-line comments to Python comments
        # PRESERVE the exact original leading whitespace
        if stripped.startswith('//'):
            comment_content = stripped[2:]  # Remove '//'
            result.append(f'{original_leading_ws}#{comment_content}')
            continue
        
        # Block comment start: /* ...
        if stripped.startswith('/*'):
            content = stripped[2:].rstrip('*').strip()
            if stripped.endswith('*/'):
                # Single line block comment: /* comment */
                content = stripped[2:-2].strip()
            result.append(f'{original_leading_ws}# {content}' if content else f'{original_leading_ws}#')
            continue
        
        # Block comment end: ... */
        if stripped.endswith('*/') and not stripped.startswith('/*'):
            content = stripped[:-2].lstrip('*').strip()
            result.append(f'{original_leading_ws}# {content}' if content else f'{original_leading_ws}#')
            continue
        
        # Block comment middle lines: * ...
        if stripped.startswith('*') and not stripped.startswith('*/'):
            content = stripped[1:].strip()
            result.append(f'{original_leading_ws}# {content}' if content else f'{original_leading_ws}#')
            continue
        
        # Class declaration - keep minimal indent (usually none)
        if stripped.startswith('class Solution'):
            result.append(f'{original_leading_ws}class Solution:')
            continue
        
        # Skip these but preserve line count with empty string
        # (braces and access modifiers have no Python equivalent)
        if stripped in ['{', '}', '};', 'public:', 'private:', 'protected:']:
            result.append('')
            continue
        
        # Convert the actual code line, preserving original indentation
        converted = convert_line(stripped)
        
        if converted:
            # Use the ORIGINAL leading whitespace, not calculated indent
            result.append(f'{original_leading_ws}{converted}')
        else:
            result.append('')
    
    python_code = '\n'.join(result)
    
    return {
        "python": python_code,
        "lines": result,
    }


def get_leading_whitespace(line: str) -> str:
    """Extract the exact leading whitespace from a line."""
    if not line:
        return ''
    stripped = line.lstrip()
    if not stripped:
        return line  # Line is all whitespace
    return line[:len(line) - len(stripped)]


def convert_line(line: str) -> str:
    """
    Convert a single line of C++ to Python.
    Returns the converted content WITHOUT leading whitespace.
    The caller will prepend the original whitespace.
    """
    line = line.strip()
    
    if not line:
        return ''
    
    # Skip standalone braces and access modifiers
    if line in ['{', '}', '};', 'public:', 'private:', 'protected:']:
        return ''
    
    # Method/function declaration
    method_match = re.match(r'^(\w+(?:<[^>]+>)?)\s+(\w+)\s*\((.*?)\)\s*(?:const\s*)?\{?$', line)
    if method_match:
        return_type, method_name, params = method_match.groups()
        python_params = convert_parameters(params)
        return_hint = convert_type_to_python_hint(return_type)
        return f'def {method_name}({python_params}) -> {return_hint}:'
    
    # For loop: for (int i = 0; i < n; i++)
    for_match = re.match(
        r'^for\s*\(\s*(?:\w+\s+)?(\w+)\s*=\s*([^;]+);\s*\1\s*(<|<=|>|>=|!=)\s*([^;]+);\s*(?:\1\+\+|\+\+\1|\1--|\-\-\1|\1\s*[\+\-]=\s*\d+)\s*\)\s*\{?$',
        line
    )
    if for_match:
        var_name, start, op, end = for_match.groups()
        start, end = start.strip(), end.strip()
        
        if op == '<':
            return f'for {var_name} in range({start}, {end}):'
        elif op == '<=':
            return f'for {var_name} in range({start}, {end} + 1):'
        elif op == '>':
            return f'for {var_name} in range({start}, {end}, -1):'
        elif op == '>=':
            return f'for {var_name} in range({start}, {end} - 1, -1):'
        else:
            return f'for {var_name} in range({start}, {end}):'
    
    # Range-based for loop: for (auto x : container)
    range_for_match = re.match(
        r'^for\s*\(\s*(?:const\s+)?(?:auto|int|char|string|auto\s*&|const\s+auto\s*&)\s+(\w+)\s*:\s*(.+?)\)\s*\{?$',
        line
    )
    if range_for_match:
        var_name, container = range_for_match.groups()
        return f'for {var_name} in {container.strip()}:'
    
    # If statement
    if_match = re.match(r'^if\s*\((.+)\)\s*\{?$', line)
    if if_match:
        condition = convert_condition(if_match.group(1))
        return f'if {condition}:'
    
    # Else if statement
    elif_match = re.match(r'^else\s+if\s*\((.+)\)\s*\{?$', line)
    if elif_match:
        condition = convert_condition(elif_match.group(1))
        return f'elif {condition}:'
    
    # Else statement
    if re.match(r'^else\s*\{?$', line):
        return 'else:'
    
    # While loop
    while_match = re.match(r'^while\s*\((.+)\)\s*\{?$', line)
    if while_match:
        condition = convert_condition(while_match.group(1))
        return f'while {condition}:'
    
    # Return statement
    return_match = re.match(r'^return\s+(.+?)\s*;?$', line)
    if return_match:
        value = convert_expression(return_match.group(1))
        return f'return {value}'
    
    # Return with no value
    if line == 'return;' or line == 'return':
        return 'return'
    
    # Variable declaration with initialization: Type var = value;
    var_decl_match = re.match(r'^(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+?)\s*;?$', line)
    if var_decl_match:
        var_type, var_name, value = var_decl_match.groups()
        converted_value = convert_expression(value)
        return f'{var_name} = {converted_value}'
    
    # Variable declaration without initialization: Type var;
    var_only_match = re.match(r'^(\w+(?:<[^>]+>)?)\s+(\w+)\s*;?$', line)
    if var_only_match:
        var_type, var_name = var_only_match.groups()
        default_value = get_default_value(var_type)
        return f'{var_name} = {default_value}'
    
    # Generic expression (assignment, function call, etc.)
    converted = convert_expression(line)
    
    # Remove trailing semicolon if present
    if converted.endswith(';'):
        converted = converted[:-1]
    
    return converted


def convert_parameters(params: str) -> str:
    """Convert C++ function parameters to Python."""
    if not params.strip():
        return 'self'
    
    param_list = ['self']
    parts = split_parameters(params.strip())
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Match: [const] Type[&*] name
        match = re.match(r'^(?:const\s+)?(\w+(?:<[^>]+>)?)\s*[&*]?\s*(\w+)$', part)
        if match:
            param_type, param_name = match.groups()
            type_hint = convert_type_to_python_hint(param_type)
            param_list.append(f'{param_name}: {type_hint}')
    
    return ', '.join(param_list)


def split_parameters(params: str) -> List[str]:
    """Split parameters by comma, respecting template brackets."""
    result = []
    current = []
    bracket_depth = 0
    
    for char in params:
        if char == '<':
            bracket_depth += 1
            current.append(char)
        elif char == '>':
            bracket_depth -= 1
            current.append(char)
        elif char == ',' and bracket_depth == 0:
            result.append(''.join(current))
            current = []
        else:
            current.append(char)
    
    if current:
        result.append(''.join(current))
    
    return result


def convert_type_to_python_hint(cpp_type: str) -> str:
    """Convert C++ type to Python type hint."""
    cpp_type = cpp_type.strip()
    
    type_map = {
        'int': 'int',
        'long': 'int',
        'long long': 'int',
        'float': 'float',
        'double': 'float',
        'bool': 'bool',
        'char': 'str',
        'string': 'str',
        'void': 'None',
    }
    
    if cpp_type in type_map:
        return type_map[cpp_type]
    
    # vector<T> -> List[T]
    vector_match = re.match(r'^vector<(.+)>$', cpp_type)
    if vector_match:
        inner = convert_type_to_python_hint(vector_match.group(1))
        return f'List[{inner}]'
    
    # map<K, V> or unordered_map<K, V> -> Dict[K, V]
    map_match = re.match(r'^(?:unordered_)?map<([^,]+),\s*(.+)>$', cpp_type)
    if map_match:
        key = convert_type_to_python_hint(map_match.group(1))
        val = convert_type_to_python_hint(map_match.group(2))
        return f'Dict[{key}, {val}]'
    
    # set<T> or unordered_set<T> -> Set[T]
    set_match = re.match(r'^(?:unordered_)?set<(.+)>$', cpp_type)
    if set_match:
        inner = convert_type_to_python_hint(set_match.group(1))
        return f'Set[{inner}]'
    
    return 'Any'


def convert_condition(condition: str) -> str:
    """Convert C++ condition to Python."""
    cond = condition.strip()
    
    # Arrow to dot: ptr->member => ptr.member
    cond = re.sub(r'(\w+)\s*->\s*(\w+)', r'\1.\2', cond)
    
    # Logical operators
    cond = cond.replace('&&', ' and ')
    cond = cond.replace('||', ' or ')
    
    # NOT operator (careful not to affect !=)
    cond = re.sub(r'!(?!=)', ' not ', cond)
    
    # Boolean/null constants
    cond = re.sub(r'\bNULL\b', 'None', cond)
    cond = re.sub(r'\bnullptr\b', 'None', cond)
    cond = re.sub(r'\btrue\b', 'True', cond)
    cond = re.sub(r'\bfalse\b', 'False', cond)
    
    # Clean up multiple spaces
    cond = re.sub(r'\s+', ' ', cond)
    
    return cond.strip()


def convert_expression(expr: str) -> str:
    """Convert C++ expression to Python."""
    e = expr.strip()
    
    # Arrow to dot
    e = re.sub(r'(\w+)\s*->\s*(\w+)', r'\1.\2', e)
    
    # Method conversions
    e = re.sub(r'\.push_back\(', '.append(', e)
    e = re.sub(r'\.pop_back\(\)', '.pop()', e)
    e = re.sub(r'\.front\(\)', '[0]', e)
    e = re.sub(r'\.back\(\)', '[-1]', e)
    e = re.sub(r'\.clear\(\)', '.clear()', e)
    e = re.sub(r'\.empty\(\)', ' == []', e)  # Simplified
    
    # size() -> len() - needs special handling
    e = re.sub(r'(\w+)\.size\(\)', r'len(\1)', e)
    e = re.sub(r'(\w+)\.length\(\)', r'len(\1)', e)
    
    # Container constructors
    e = re.sub(r'\bvector<[^>]+>\s*\((\d+)\)', r'[0] * \1', e)
    e = re.sub(r'\bvector<[^>]+>\s*\((\d+),\s*([^)]+)\)', r'[\2] * \1', e)
    e = re.sub(r'\bvector<[^>]+>\s*\(\)', '[]', e)
    e = re.sub(r'\bvector<[^>]+>\s*\{([^}]*)\}', r'[\1]', e)
    e = re.sub(r'\b(?:unordered_)?map<[^>]+>\s*\(\)', '{}', e)
    e = re.sub(r'\b(?:unordered_)?set<[^>]+>\s*\(\)', 'set()', e)
    
    # new keyword
    e = re.sub(r'\bnew\s+(\w+)\s*\(([^)]*)\)', r'\1(\2)', e)
    
    # Logical operators
    e = e.replace('&&', ' and ')
    e = e.replace('||', ' or ')
    
    # NOT (careful with !=)
    e = re.sub(r'!(?!=)', ' not ', e)
    
    # Constants
    e = re.sub(r'\bNULL\b', 'None', e)
    e = re.sub(r'\bnullptr\b', 'None', e)
    e = re.sub(r'\btrue\b', 'True', e)
    e = re.sub(r'\bfalse\b', 'False', e)
    
    # INT_MAX, INT_MIN
    e = re.sub(r'\bINT_MAX\b', 'float("inf")', e)
    e = re.sub(r'\bINT_MIN\b', 'float("-inf")', e)
    
    # Remove trailing semicolon
    if e.endswith(';'):
        e = e[:-1]
    
    # Clean up spaces
    e = re.sub(r'\s+', ' ', e)
    
    return e.strip()


def get_default_value(cpp_type: str) -> str:
    """Get default value for a C++ type."""
    t = cpp_type.strip().lower()
    
    if t in ['int', 'long', 'long long', 'float', 'double', 'size_t']:
        return '0'
    elif t == 'bool':
        return 'False'
    elif t in ['char', 'string']:
        return '""'
    elif 'vector' in t:
        return '[]'
    elif 'map' in t:
        return '{}'
    elif 'set' in t:
        return 'set()'
    else:
        return 'None'
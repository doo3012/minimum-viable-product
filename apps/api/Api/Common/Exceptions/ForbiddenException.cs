namespace Api.Common.Exceptions;

public class ForbiddenException(string message = "Forbidden") : Exception(message);
